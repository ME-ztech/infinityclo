/**
 * Checkout boundary.
 *
 * This storefront never takes a payment. The cart is handed to **Shopify-hosted
 * checkout**, which is the single authority for price, stock, tax, shipping,
 * discounts and payment:
 *
 *   Cart (identities only, priced server-side)
 *     -> cart permalink        https://<store>/cart/<variant>:<qty>,…
 *     -> Shopify checkout      (hosted; card data never touches this app)
 *     -> Order                 (created by Shopify, delivered here by webhook)
 *
 * A cart permalink is a documented Shopify URL that pre-loads a cart and
 * forwards to checkout. Building one writes nothing to the store and needs no
 * credential, which is why checkout works before any API token exists.
 *
 * The rule this file encodes: only purchasable lines are ever handed over, and
 * nothing in the browser can mark an order as paid — there is no order object
 * on this side of the handoff at all.
 */
import type { Cart, CartLine } from './types';

export type CheckoutAvailability =
  | { status: 'available' }
  | { status: 'unavailable'; reason: 'disabled' | 'empty_cart' | 'items_unavailable' };

export const isLinePurchasable = (line: CartLine): boolean =>
  line.availability !== 'sold_out' && line.availability !== 'archived';

/** Whether this cart can be handed to checkout. */
export function checkoutAvailability(cart: Cart, isEnabled: boolean): CheckoutAvailability {
  if (!isEnabled) return { status: 'unavailable', reason: 'disabled' };
  if (cart.lines.length === 0) return { status: 'unavailable', reason: 'empty_cart' };
  if (cart.lines.some((line) => !isLinePurchasable(line))) {
    return { status: 'unavailable', reason: 'items_unavailable' };
  }
  return { status: 'available' };
}

export interface CheckoutHandoffInput {
  /** Host serving Shopify checkout, e.g. `example.myshopify.com`. */
  readonly checkoutDomain: string;
  readonly lines: ReadonlyArray<{ variantId: string; quantity: number }>;
  /** A live discount code to pre-apply. Shopify validates it; an invalid code is ignored there. */
  readonly discountCode?: string | null;
  /** Attribution passed through to the order, e.g. `{ utm_source: 'instagram' }`. */
  readonly attributes?: Readonly<Record<string, string>>;
}

const VARIANT_ID = /^\d{6,20}$/;
const DISCOUNT_CODE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Builds the Shopify cart permalink for a set of lines.
 *
 * Throws on anything that is not a numeric Shopify variant id or a sane
 * quantity, so a malformed line can never produce a URL that silently drops an
 * item from the customer's order.
 */
export function buildCheckoutUrl({ checkoutDomain, lines, discountCode, attributes }: CheckoutHandoffInput): string {
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(checkoutDomain)) {
    throw new Error('Checkout domain is not a valid host.');
  }
  if (lines.length === 0) throw new Error('Cannot check out an empty cart.');

  const merged = new Map<string, number>();
  for (const line of lines) {
    if (!VARIANT_ID.test(line.variantId)) throw new Error(`"${line.variantId}" is not a Shopify variant id.`);
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99) {
      throw new Error('Quantity must be a whole number between 1 and 99.');
    }
    merged.set(line.variantId, (merged.get(line.variantId) ?? 0) + line.quantity);
  }

  const path = [...merged.entries()].map(([variantId, quantity]) => `${variantId}:${quantity}`).join(',');
  const url = new URL(`https://${checkoutDomain}/cart/${path}`);
  if (discountCode && DISCOUNT_CODE.test(discountCode)) url.searchParams.set('discount', discountCode);
  for (const [key, value] of Object.entries(attributes ?? {})) {
    if (/^[a-z0-9_]{1,40}$/i.test(key) && value) url.searchParams.set(`attributes[${key}]`, value.slice(0, 200));
  }
  return url.toString();
}
