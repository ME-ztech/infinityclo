/**
 * Checkout handoff.
 *
 * The browser posts cart identities (slug, variant id, quantity). This route
 * re-resolves every line against the live catalogue, refuses the handoff if any
 * line is sold out or no longer exists, and returns the Shopify-hosted checkout
 * URL. Prices are never accepted from the client and no order is created here:
 * Shopify owns payment, tax, shipping, discounts and the order itself.
 */
import { NextResponse } from 'next/server';

import { buildCheckoutUrl, checkoutAvailability } from '@/domain/checkout';
import { resolveCart } from '@/lib/cart/resolve';
import { parsePersistedCartValue } from '@/lib/cart/storage';
import { CHECKOUT_ENABLED } from '@/lib/site';
import { config } from '@/server/config';
import { clientAddress, isSameOrigin, rateLimit } from '@/server/security';
import { activeCheckoutCode } from '@/server/offers';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'Cross-site request refused.' }, { status: 403 });
  }
  const limit = rateLimit('checkout', clientAddress(request), 30, 60);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again shortly.' },
      { status: 429, headers: { 'retry-after': String(limit.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const persisted = parsePersistedCartValue((body as { cart?: unknown })?.cart);
  const { cart, droppedLines } = await resolveCart(persisted);

  if (droppedLines.length > 0) {
    return NextResponse.json(
      { error: 'Some items in your cart are no longer available. Review your cart and try again.', code: 'cart_changed' },
      { status: 409 },
    );
  }

  const availability = checkoutAvailability(cart, CHECKOUT_ENABLED);
  if (availability.status === 'unavailable') {
    const messages = {
      disabled: 'Checkout is not available on this preview.',
      empty_cart: 'Your cart is empty.',
      items_unavailable: 'Remove the sold-out items from your cart to continue.',
    } as const;
    return NextResponse.json({ error: messages[availability.reason], code: availability.reason }, { status: 409 });
  }

  const requestedCode = (body as { discountCode?: unknown })?.discountCode;
  const discountCode = await activeCheckoutCode(typeof requestedCode === 'string' ? requestedCode : null);

  const url = buildCheckoutUrl({
    checkoutDomain: config.shopify.checkoutDomain,
    lines: cart.lines.map((line) => ({ variantId: line.variantId, quantity: line.quantity })),
    discountCode,
  });

  return NextResponse.json({ url });
}
