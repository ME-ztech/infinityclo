/**
 * Offer storage and the storefront's view of offers.
 *
 * Drafts live here. Activation (an Owner-only admin action) creates the real
 * discount in Shopify and records its id on the offer; only then does the
 * storefront acknowledge the offer exists.
 */
import 'server-only';

import { isOfferActive, validateOffer, type Offer, type OfferInput } from '@/domain/offers';

import { getStore, newId } from './store';

export async function listOffers(): Promise<Offer[]> {
  const offers = await getStore().list<Offer>('offers');
  return offers.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getOffer(id: string): Promise<Offer | null> {
  return getStore().get<Offer>('offers', id);
}

/** Creates a DRAFT. A new offer is never live. */
export async function createOfferDraft(input: OfferInput, actor: string): Promise<Offer> {
  const problems = validateOffer(input);
  if (problems.length) throw new OfferValidationError(problems);
  const now = new Date().toISOString();
  const offer: Offer = {
    ...input,
    code: input.method === 'code' ? (input.code ?? null) : null,
    minQuantity: input.kind === 'bundle' ? input.minQuantity : null,
    id: newId('off'),
    status: 'draft',
    marginCheckedBy: null,
    discountId: null,
    sandbox: false,
    createdAt: now,
    updatedAt: now,
    createdBy: actor,
    activatedAt: null,
    activatedBy: null,
  };
  await getStore().put('offers', offer.id, offer);
  return offer;
}

/** Edits are allowed only while the offer is a draft or paused. */
export async function updateOfferDraft(id: string, input: OfferInput): Promise<Offer> {
  const existing = await getOffer(id);
  if (!existing) throw new Error('Offer not found.');
  if (existing.status === 'live') {
    throw new Error('A live offer cannot be edited. Pause it first, so checkout and the storefront never disagree.');
  }
  const problems = validateOffer(input);
  if (problems.length) throw new OfferValidationError(problems);
  const offer: Offer = {
    ...existing,
    ...input,
    code: input.method === 'code' ? (input.code ?? null) : null,
    minQuantity: input.kind === 'bundle' ? input.minQuantity : null,
    updatedAt: new Date().toISOString(),
  };
  await getStore().put('offers', id, offer);
  return offer;
}

export async function saveOffer(offer: Offer): Promise<Offer> {
  const next = { ...offer, updatedAt: new Date().toISOString() };
  await getStore().put('offers', offer.id, next);
  return next;
}

export async function deleteOfferDraft(id: string): Promise<void> {
  const existing = await getOffer(id);
  if (!existing) return;
  if (existing.status === 'live') throw new Error('Pause the offer before deleting it.');
  await getStore().delete('offers', id);
}

export class OfferValidationError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join(' '));
    this.name = 'OfferValidationError';
  }
}

/**
 * Offers the public storefront may know about: live, inside their window, and
 * really present in Shopify. Sandbox activations are excluded — they exist only
 * inside the admin sandbox and would not be honoured at checkout.
 */
export async function listStorefrontOffers(now: Date = new Date()): Promise<Offer[]> {
  try {
    const offers = await getStore().list<Offer>('offers');
    return offers.filter((offer) => isOfferActive(offer, now) && !offer.sandbox && offer.discountId !== null);
  } catch {
    return [];
  }
}

/**
 * The discount code to carry into checkout, if any.
 *
 * A code is forwarded only when it matches a live code offer here. Shopify still
 * validates it; this simply avoids decorating the checkout URL with a code the
 * store has never issued.
 */
export async function activeCheckoutCode(requested: string | null): Promise<string | null> {
  if (!requested) return null;
  const wanted = requested.trim().toUpperCase();
  const offers = await listStorefrontOffers();
  return offers.find((offer) => offer.method === 'code' && offer.code === wanted)?.code ?? null;
}
