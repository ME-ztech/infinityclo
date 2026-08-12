/**
 * Checkout boundary.
 *
 * Phase 1 ships **no payment capability**. This file exists to make the future
 * flow explicit and to give the UI a single honest place to ask "can this
 * storefront take money?" — the answer today is no.
 *
 *   Cart
 *     -> CheckoutSession        (server-created, server-priced)
 *     -> InventoryReservation   (stock held for the session's lifetime)
 *     -> Payment                (provider-hosted; we never touch card data)
 *     -> VerifiedPaymentEvent   (provider webhook, signature-verified)
 *     -> Order                  (created only from a verified event)
 *     -> Fulfilment
 *
 * The single rule this encodes: an Order may be created only from a
 * `VerifiedPaymentEvent` that arrived server-side and passed signature
 * verification. Browser state never establishes that a payment succeeded, so
 * there is no client-callable path from cart to order — not even a stubbed one.
 */
import type { Cart, Money } from './types';

export type CheckoutAvailability =
  | { status: 'available' }
  | { status: 'unavailable'; reason: 'not_implemented' | 'empty_cart' | 'items_unavailable' };

export interface CheckoutSession {
  readonly id: string;
  readonly cartId: string;
  readonly subtotal: Money;
  /** Null until the server computes them; never estimated on the client. */
  readonly shipping: Money | null;
  readonly tax: Money | null;
  readonly total: Money | null;
  readonly expiresAt: string;
  readonly status: 'open' | 'reserved' | 'awaiting_payment' | 'completed' | 'expired';
}

export interface CheckoutGateway {
  /**
   * Creates a server-side session and returns where to send the customer.
   * Phase 1 has no implementation; nothing calls this yet.
   */
  createSession(cart: Cart): Promise<CheckoutSession>;
  getRedirectUrl(session: CheckoutSession): Promise<string>;
}

/**
 * Whether checkout can proceed. Called by the UI to decide between a live
 * checkout button and an explicit "not available" state.
 */
export function checkoutAvailability(cart: Cart, isEnabled: boolean): CheckoutAvailability {
  if (!isEnabled) return { status: 'unavailable', reason: 'not_implemented' };
  if (cart.lines.length === 0) return { status: 'unavailable', reason: 'empty_cart' };
  if (cart.lines.some((line) => line.availability === 'sold_out' || line.availability === 'archived')) {
    return { status: 'unavailable', reason: 'items_unavailable' };
  }
  return { status: 'available' };
}
