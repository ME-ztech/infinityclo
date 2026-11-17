/**
 * What the cart resolver returns beside the priced cart. Shared by the route
 * handler and the client provider so the two cannot drift.
 */
import type { Money, Product } from '@/domain/types';

export interface CartOfferSummary {
  readonly id: string;
  readonly kind: 'percentage' | 'bundle';
  readonly title: string;
  readonly description: string;
  readonly applies: boolean;
  readonly savings: Money;
  /** Bundles that do not apply yet: eligible items still needed. */
  readonly unitsShort: number;
}

export interface CartExtras {
  readonly offers: readonly CartOfferSummary[];
  readonly recommendations: readonly Product[];
}

export const NO_EXTRAS: CartExtras = { offers: [], recommendations: [] };
