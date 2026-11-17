/**
 * Offers — percentage promotions and quantity bundles.
 *
 * An offer is authored here as a DRAFT and only becomes real when an Owner
 * activates it, which creates the matching discount in Shopify. From that point
 * Shopify enforces it at checkout; this module only *estimates* the saving so
 * the cart can show honest maths before the handoff.
 *
 * Two kinds, both expressible as native Shopify discounts so the estimate and
 * the checkout total cannot disagree by construction:
 *
 *   percentage  X% off eligible items.
 *   bundle      X% off eligible items once the cart holds at least N of them
 *               (Shopify automatic discount with a minimum quantity).
 *
 * Nothing in this file talks to a network or a store. It is pure and unit-tested.
 */
import { categoryGroupOf, type CategoryGroup } from './taxonomy';
import type { CartLine, Money, Product } from './types';

export type OfferKind = 'percentage' | 'bundle';

/**
 * draft      Being written. Invisible to customers. Not in Shopify.
 * live       Activated by an Owner; the discount exists in Shopify.
 * paused     Deactivated in Shopify; kept for reactivation.
 * ended      Finished or deleted in Shopify; kept for the record.
 */
export type OfferStatus = 'draft' | 'live' | 'paused' | 'ended';

export interface OfferEligibility {
  readonly scope: 'all' | 'products' | 'categories';
  readonly productSlugs: readonly string[];
  readonly categories: readonly CategoryGroup[];
  /** Items already carrying a compare-at ("sale") price are skipped. */
  readonly excludeSaleItems: boolean;
}

export interface Offer {
  readonly id: string;
  readonly kind: OfferKind;
  readonly title: string;
  readonly status: OfferStatus;
  /** `code`: customer enters or is handed a code. `automatic`: applied by Shopify. */
  readonly method: 'code' | 'automatic';
  readonly code: string | null;
  readonly percentOff: number;
  /** Bundles only: eligible units required before the saving applies. */
  readonly minQuantity: number | null;
  /** `first_order` restricts the code to customers with no previous order. */
  readonly audience: 'everyone' | 'first_order';
  readonly eligibility: OfferEligibility;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly usageLimit: number | null;
  readonly oncePerCustomer: boolean;
  readonly combinesWith: {
    readonly productDiscounts: boolean;
    readonly orderDiscounts: boolean;
    readonly shippingDiscounts: boolean;
  };
  /** Whether the storefront may advertise the offer once it is live. */
  readonly showOnStorefront: boolean;
  /** Owner's margin sign-off, required before activation. */
  readonly marginCheckedBy: string | null;
  readonly discountId: string | null;
  /** True when the "activation" happened in the admin sandbox, not in Shopify. */
  readonly sandbox: boolean;
  readonly internalNote: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly createdBy: string;
  readonly activatedAt: string | null;
  readonly activatedBy: string | null;
}

export type OfferInput = Pick<
  Offer,
  | 'kind'
  | 'title'
  | 'method'
  | 'code'
  | 'percentOff'
  | 'minQuantity'
  | 'audience'
  | 'eligibility'
  | 'startsAt'
  | 'endsAt'
  | 'usageLimit'
  | 'oncePerCustomer'
  | 'combinesWith'
  | 'showOnStorefront'
  | 'internalNote'
>;

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;

/** Returns every problem with a draft, in the order a form would show them. */
export function validateOffer(input: OfferInput): string[] {
  const problems: string[] = [];
  if (!input.title.trim()) problems.push('Give the offer a title.');
  if (!Number.isFinite(input.percentOff) || input.percentOff < 1 || input.percentOff > 90) {
    problems.push('Percent off must be between 1 and 90.');
  }
  if (input.method === 'code') {
    if (!input.code || !CODE_PATTERN.test(input.code)) {
      problems.push('Codes are 3–32 characters: capital letters, numbers, hyphen or underscore.');
    }
  }
  if (input.kind === 'bundle') {
    if (!input.minQuantity || !Number.isInteger(input.minQuantity) || input.minQuantity < 2 || input.minQuantity > 20) {
      problems.push('A bundle needs a minimum quantity between 2 and 20.');
    }
    if (input.method !== 'automatic') {
      problems.push('Bundles are applied automatically at checkout, so they cannot use a code.');
    }
  }
  if (input.audience === 'first_order' && input.method !== 'code') {
    problems.push('A first-order offer must use a code, because checkout has to recognise the customer.');
  }
  if (input.eligibility.scope === 'products' && input.eligibility.productSlugs.length === 0) {
    problems.push('Choose at least one eligible product.');
  }
  if (input.eligibility.scope === 'categories' && input.eligibility.categories.length === 0) {
    problems.push('Choose at least one eligible category.');
  }
  if (input.startsAt && Number.isNaN(Date.parse(input.startsAt))) problems.push('The start date is not valid.');
  if (input.endsAt && Number.isNaN(Date.parse(input.endsAt))) problems.push('The end date is not valid.');
  if (input.startsAt && input.endsAt && Date.parse(input.endsAt) <= Date.parse(input.startsAt)) {
    problems.push('The end date must be after the start date.');
  }
  if (input.usageLimit !== null && (!Number.isInteger(input.usageLimit) || input.usageLimit < 1)) {
    problems.push('The usage limit must be a whole number of at least 1, or left empty.');
  }
  return problems;
}

/** A live offer inside its date window. Drafts and paused offers are never active. */
export function isOfferActive(offer: Offer, now: Date = new Date()): boolean {
  if (offer.status !== 'live') return false;
  if (offer.startsAt && Date.parse(offer.startsAt) > now.getTime()) return false;
  if (offer.endsAt && Date.parse(offer.endsAt) <= now.getTime()) return false;
  return true;
}

export function isLineEligible(offer: Offer, line: CartLine, product: Product | undefined): boolean {
  if (line.availability === 'sold_out' || line.availability === 'archived') return false;
  if (offer.eligibility.excludeSaleItems && line.compareAtUnitPrice) return false;
  switch (offer.eligibility.scope) {
    case 'all':
      return true;
    case 'products':
      return offer.eligibility.productSlugs.includes(line.productSlug);
    case 'categories': {
      const group = product ? categoryGroupOf(product) : null;
      return group !== null && offer.eligibility.categories.includes(group);
    }
  }
}

export interface OfferEstimate {
  readonly offer: Offer;
  /** True when the cart currently qualifies. */
  readonly applies: boolean;
  readonly eligibleQuantity: number;
  readonly eligibleSubtotal: Money;
  readonly savings: Money;
  /** For bundles that do not yet apply: eligible units still needed. */
  readonly unitsShort: number;
}

/**
 * Estimates what an active offer would take off this cart.
 *
 * Rounding follows Shopify's allocation of a percentage discount: the saving is
 * computed per line on the line total and rounded half-up to the cent.
 */
export function estimateOffer(
  offer: Offer,
  lines: readonly CartLine[],
  productsBySlug: ReadonlyMap<string, Product>,
): OfferEstimate {
  const currency = lines[0]?.unitPrice.currency ?? 'CAD';
  const eligible = lines.filter((line) => isLineEligible(offer, line, productsBySlug.get(line.productSlug)));
  const eligibleQuantity = eligible.reduce((total, line) => total + line.quantity, 0);
  const eligibleSubtotal = eligible.reduce((total, line) => total + line.unitPrice.amount * line.quantity, 0);

  const threshold = offer.kind === 'bundle' ? (offer.minQuantity ?? 2) : 1;
  const applies = eligibleQuantity >= threshold;
  const savings = applies
    ? eligible.reduce(
        (total, line) => total + Math.round((line.unitPrice.amount * line.quantity * offer.percentOff) / 100),
        0,
      )
    : 0;

  return {
    offer,
    applies,
    eligibleQuantity,
    eligibleSubtotal: { amount: eligibleSubtotal, currency },
    savings: { amount: savings, currency },
    unitsShort: applies ? 0 : Math.max(0, threshold - eligibleQuantity),
  };
}

/**
 * Offers the cart can surface automatically: live, in window, and not requiring
 * the customer to be identified. First-order codes are excluded because only
 * checkout can establish that it is a first order.
 */
export function automaticEstimates(
  offers: readonly Offer[],
  lines: readonly CartLine[],
  productsBySlug: ReadonlyMap<string, Product>,
  now: Date = new Date(),
): OfferEstimate[] {
  return offers
    .filter((offer) => isOfferActive(offer, now) && offer.method === 'automatic' && offer.audience === 'everyone')
    .map((offer) => estimateOffer(offer, lines, productsBySlug))
    .sort((a, b) => b.savings.amount - a.savings.amount);
}

/** Plain-language summary used in admin lists and storefront messaging. */
export function describeOffer(offer: Pick<Offer, 'kind' | 'percentOff' | 'minQuantity' | 'audience' | 'method' | 'code'>): string {
  const base =
    offer.kind === 'bundle'
      ? `${offer.percentOff}% off when you buy ${offer.minQuantity ?? 2} or more`
      : `${offer.percentOff}% off`;
  const audience = offer.audience === 'first_order' ? ' your first order' : '';
  const how = offer.method === 'code' && offer.code ? ` with code ${offer.code}` : '';
  return `${base}${audience}${how}`;
}
