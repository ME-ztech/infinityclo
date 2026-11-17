/**
 * Checkout boundary.
 *
 * Shopify is the system of record for payment, tax, shipping and orders (see
 * docs/architecture-decision.md). This storefront never takes card data and
 * never creates an order: it hands a server-priced, server-validated cart to
 * Shopify-hosted checkout, and Shopify creates the order. Our order views read
 * what Shopify recorded.
 *
 *   Cart (identities only, in the browser)
 *     -> /api/checkout           re-prices every line from the catalogue,
 *                                refuses sold-out or unknown variants
 *     -> Shopify cart            Storefront Cart API `checkoutUrl`, or a cart
 *                                permalink built from real variant ids
 *     -> Shopify checkout        taxes, shipping, discounts, payment
 *     -> Shopify order           webhooks notify us; we never write orders
 */
import type { Cart } from './types';

export type CheckoutMode = 'storefront' | 'permalink' | 'disabled';

export type CheckoutAvailability =
  | { status: 'available' }
  | { status: 'unavailable'; reason: 'not_connected' | 'empty_cart' | 'items_unavailable' };

/** Whether the checkout button can be offered for this cart. */
export function checkoutAvailability(cart: Cart, mode: CheckoutMode): CheckoutAvailability {
  if (mode === 'disabled') return { status: 'unavailable', reason: 'not_connected' };
  if (cart.lines.length === 0) return { status: 'unavailable', reason: 'empty_cart' };
  if (
    cart.lines.some((line) => line.availability === 'sold_out' || line.availability === 'archived')
  ) {
    return { status: 'unavailable', reason: 'items_unavailable' };
  }
  return { status: 'available' };
}

/**
 * Shopify cart permalink: `https://{shop}/cart/{variantId}:{qty},…`.
 * Shopify builds a cart from real variant ids and opens its own checkout, where
 * every price, tax and shipping rate is computed by Shopify. Optional
 * `discount` pre-applies a Shopify discount code.
 * https://shopify.dev/docs/apps/build/checkout/create-cart-permalinks
 */
export function buildCartPermalink(
  storeDomain: string,
  lines: ReadonlyArray<{ variantId: string; quantity: number }>,
  options: { discountCode?: string | null } = {},
): string {
  if (lines.length === 0) throw new Error('Cannot build a checkout link for an empty cart.');
  const items = lines.map((line) => {
    if (!/^\d+$/.test(line.variantId))
      throw new Error(`Variant id "${line.variantId}" is not a Shopify variant id.`);
    const quantity = Math.trunc(line.quantity);
    if (!Number.isFinite(quantity) || quantity < 1)
      throw new Error('Quantities must be at least 1.');
    return `${line.variantId}:${quantity}`;
  });
  const url = new URL(
    `https://${storeDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')}/cart/${items.join(',')}`,
  );
  if (options.discountCode) url.searchParams.set('discount', options.discountCode);
  url.searchParams.set('ref', 'infnity-storefront');
  return url.toString();
}
