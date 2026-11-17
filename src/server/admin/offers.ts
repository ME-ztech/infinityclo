/**
 * Offer activation.
 *
 * Drafts are harmless: they live in the local store and no customer can see or
 * use them. Activation is the moment an offer starts costing margin, so it has
 * three independent locks, all enforced here on the server:
 *
 *   1. the actor holds `offers.activate` (Owner only);
 *   2. an Owner has recorded a margin check on this exact draft;
 *   3. the request carries the typed confirmation word.
 *
 * Only then is the discount created through the gateway. In sandbox mode the
 * offer is marked `sandbox: true`, which the storefront treats as not live.
 */
import 'server-only';

import { catalogRepository } from '@/data';
import type { Offer } from '@/domain/offers';
import { categoryGroupOf } from '@/domain/taxonomy';

import { createOfferDraft, getOffer, listOffers, saveOffer } from '../offers';
import { getStore } from '../store';

import { authorise, type AdminSession } from './auth';
import type { CommerceGateway } from './gateway';

export const ACTIVATE_CONFIRMATION = 'ACTIVATE';

/**
 * Creates the two starter drafts once, on a store that has never had an offer.
 * Both are DRAFTS. Nothing is activated, and deleting them does not bring
 * them back.
 */
export async function seedDefaultOffers(actor: string): Promise<void> {
  const store = getStore();
  if ((await listOffers()).length > 0) return;
  const claimed = await store.putIfAbsent('content', 'offers-seeded', { at: new Date().toISOString() });
  if (!claimed) return;

  const shared = {
    eligibility: { scope: 'all' as const, productSlugs: [], categories: [], excludeSaleItems: false },
    startsAt: null,
    endsAt: null,
    usageLimit: null,
    combinesWith: { productDiscounts: false, orderDiscounts: false, shippingDiscounts: true },
    showOnStorefront: false,
  };
  await createOfferDraft(
    {
      ...shared,
      kind: 'percentage',
      title: '10% off your first order',
      method: 'code',
      code: 'TROOP10',
      percentOff: 10,
      minQuantity: null,
      audience: 'first_order',
      oncePerCustomer: true,
      internalNote: 'Starter draft. Review eligibility, dates and margin before activating.',
    },
    actor,
  );
  await createOfferDraft(
    {
      ...shared,
      kind: 'bundle',
      title: 'Bundle: 2 or more',
      method: 'automatic',
      code: null,
      percentOff: 10,
      minQuantity: 2,
      audience: 'everyone',
      oncePerCustomer: false,
      internalNote: 'Starter draft. Set the saving and eligible products before activating.',
    },
    actor,
  );
}

/**
 * Turns an offer's eligibility into explicit product ids, and — more usefully —
 * proves the offer matches something before it can go live.
 *
 * Returns null for "every product". The native checkout evaluates eligibility
 * itself from the stored rule (product handles, category groups, sale items),
 * so the ids are only consumed by the sandbox; the check that at least one
 * product matches applies everywhere.
 */
export async function resolveEligibleProductIds(offer: Offer): Promise<string[] | null> {
  const { scope, productSlugs, categories, excludeSaleItems } = offer.eligibility;
  if (scope === 'all' && !excludeSaleItems) return null;

  const { products } = await catalogRepository.listProducts();
  const eligible = products.filter((product) => {
    if (scope === 'products' && !productSlugs.includes(product.slug)) return false;
    if (scope === 'categories') {
      const group = categoryGroupOf(product);
      if (!group || !categories.includes(group)) return false;
    }
    if (excludeSaleItems && product.variants.some((variant) => variant.compareAtPrice)) return false;
    return true;
  });
  if (eligible.length === 0) throw new Error('No product in the catalogue matches this offer’s eligibility.');
  return eligible.map((product) => product.id);
}

async function mustGet(id: string): Promise<Offer> {
  const offer = await getOffer(id);
  if (!offer) throw new Error('Offer not found.');
  return offer;
}

/** Records that an Owner has checked the margin on this draft. */
export async function acknowledgeMargin(id: string, session: AdminSession): Promise<Offer> {
  authorise(session, 'offers.activate');
  const offer = await mustGet(id);
  if (offer.status === 'live') throw new Error('This offer is already live.');
  return saveOffer({ ...offer, marginCheckedBy: session.email });
}

export async function activateOffer(
  id: string,
  session: AdminSession,
  confirmation: string,
  gateway: CommerceGateway | null,
): Promise<Offer> {
  authorise(session, 'offers.activate');
  const offer = await mustGet(id);
  if (offer.status === 'live') throw new Error('This offer is already live.');
  if (offer.status === 'ended') throw new Error('An ended offer cannot be reactivated. Duplicate it as a new draft instead.');
  if (!offer.marginCheckedBy) throw new Error('Record the margin check before activating this offer.');
  if (confirmation !== ACTIVATE_CONFIRMATION) throw new Error(`Type ${ACTIVATE_CONFIRMATION} to confirm.`);
  if (!gateway) throw new Error('The commerce database is not configured, so a discount cannot be created. The offer stays a draft.');

  let discountId = offer.shopifyDiscountId;
  if (discountId) {
    await gateway.setDiscountActive(discountId, offer.method, true);
  } else {
    const productIds = await resolveEligibleProductIds(offer);
    discountId = (await gateway.createDiscount(offer, productIds)).id;
  }

  return saveOffer({
    ...offer,
    status: 'live',
    shopifyDiscountId: discountId,
    sandbox: gateway.mode === 'sandbox',
    activatedAt: new Date().toISOString(),
    activatedBy: session.email,
  });
}

/** Deactivates the discount but keeps it, so it can be reactivated. */
export async function pauseOffer(id: string, session: AdminSession, gateway: CommerceGateway | null): Promise<Offer> {
  authorise(session, 'offers.activate');
  const offer = await mustGet(id);
  if (offer.status !== 'live') throw new Error('Only a live offer can be paused.');
  if (!gateway) throw new Error('The commerce database is not configured, so the discount cannot be deactivated from here.');
  if (offer.shopifyDiscountId) await gateway.setDiscountActive(offer.shopifyDiscountId, offer.method, false);
  // Pausing invalidates the margin sign-off: reactivation needs a fresh check.
  return saveOffer({ ...offer, status: 'paused', marginCheckedBy: null });
}

/** Deletes the discount and closes the offer for good. */
export async function endOffer(id: string, session: AdminSession, gateway: CommerceGateway | null): Promise<Offer> {
  authorise(session, 'offers.activate');
  const offer = await mustGet(id);
  if (offer.status === 'draft') throw new Error('A draft has nothing to end. Delete it instead.');
  if (offer.status === 'ended') return offer;
  if (offer.shopifyDiscountId) {
    if (!gateway) throw new Error('The commerce database is not configured, so the discount cannot be removed from here.');
    await gateway.deleteDiscount(offer.shopifyDiscountId, offer.method);
  }
  return saveOffer({ ...offer, status: 'ended', shopifyDiscountId: null });
}
