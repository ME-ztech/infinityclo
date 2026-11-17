/**
 * Start a checkout.
 *
 * The browser posts cart identities (variant ids and quantities). This route
 * prices them from the database, reserves the stock, and puts an opaque
 * checkout token in an httpOnly cookie. The response is just where to go next.
 * No price is accepted from the client and no order exists yet.
 */
import { NextResponse } from 'next/server';

import { parsePersistedCartValue } from '@/lib/cart/storage';
import { CHECKOUT_ENABLED } from '@/lib/site';
import { CheckoutError, createCheckout, updateCheckout } from '@/server/commerce/checkout';
import { InsufficientStockError } from '@/server/commerce/inventory';
import { checkoutReadiness, refreshAvailability } from '@/server/commerce/service';
import { currentCustomer, setCheckoutCookie } from '@/server/commerce/session';
import { clientAddress, isSameOrigin, rateLimit } from '@/server/security';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'Cross-site request refused.' }, { status: 403 });
  }
  const limit = rateLimit('checkout', clientAddress(request), 20, 60);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again shortly.' },
      { status: 429, headers: { 'retry-after': String(limit.retryAfterSeconds) } },
    );
  }

  if (!CHECKOUT_ENABLED) {
    return NextResponse.json({ error: 'Checkout is switched off on this preview.', code: 'disabled' }, { status: 409 });
  }
  const readiness = await checkoutReadiness();
  if (!readiness.open) {
    return NextResponse.json({ error: readiness.message, code: 'closed' }, { status: 409 });
  }

  let body: { cart?: unknown; discountCode?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const persisted = parsePersistedCartValue(body.cart);
  const customer = await currentCustomer();

  try {
    const { token, checkout } = await createCheckout({
      lines: persisted.lines.map((line) => ({ variantId: line.variantId, quantity: line.quantity })),
      customerId: customer?.id ?? null,
      email: customer?.email ?? null,
    });
    if (typeof body.discountCode === 'string' && body.discountCode.trim()) {
      await updateCheckout(token, { discountCode: body.discountCode });
    }
    await setCheckoutCookie(token);
    refreshAvailability(checkout.lines.map((line) => line.productHandle));
    return NextResponse.json({ url: '/checkout' });
  } catch (error) {
    if (error instanceof InsufficientStockError) {
      return NextResponse.json(
        { error: 'An item in your cart just sold out or there are not enough left. Review your cart and try again.', code: 'cart_changed' },
        { status: 409 },
      );
    }
    if (error instanceof CheckoutError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    }
    console.error(`[checkout] could not start: ${(error as Error).message}`);
    return NextResponse.json({ error: 'Checkout could not be started. Try again.' }, { status: 500 });
  }
}
