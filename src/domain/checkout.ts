/**
 * Checkout boundary, as the browser sees it.
 *
 *   Cart (identities only, priced server-side)
 *     -> POST /api/checkout      server prices the lines and reserves stock
 *     -> /checkout               contact, address, shipping, discount, payment
 *     -> payment provider        card details go from the browser to Stripe
 *     -> signed webhook          the only place an order is created
 *     -> /checkout/complete      reads the order the webhook created
 *
 * The rule this file encodes for the UI: only purchasable lines may be taken to
 * checkout. Everything else — prices, stock, tax, the order itself — is decided
 * on the server (`src/server/commerce/checkout.ts`).
 */
import type { Cart, CartLine } from './types';

export type CheckoutAvailability =
  | { status: 'available' }
  | { status: 'unavailable'; reason: 'disabled' | 'empty_cart' | 'items_unavailable' };

export const isLinePurchasable = (line: CartLine): boolean =>
  line.availability !== 'sold_out' && line.availability !== 'archived';

/** Whether this cart may be taken to checkout. */
export function checkoutAvailability(cart: Cart, isEnabled: boolean): CheckoutAvailability {
  if (!isEnabled) return { status: 'unavailable', reason: 'disabled' };
  if (cart.lines.length === 0) return { status: 'unavailable', reason: 'empty_cart' };
  if (cart.lines.some((line) => !isLinePurchasable(line))) {
    return { status: 'unavailable', reason: 'items_unavailable' };
  }
  return { status: 'available' };
}
