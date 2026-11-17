/**
 * The active checkout: read it, update it, or abandon it.
 *
 * The checkout is identified only by the httpOnly cookie set when it was
 * created, so there is no id in the URL to guess or share.
 */
import { NextResponse } from 'next/server';

import { CheckoutError, cancelCheckout, getCheckoutByToken, updateCheckout } from '@/server/commerce/checkout';
import { checkoutView } from '@/server/commerce/service';
import { checkoutToken, clearCheckoutCookie } from '@/server/commerce/session';
import { clientAddress, isSameOrigin, rateLimit } from '@/server/security';

export const dynamic = 'force-dynamic';

const noStore = { 'cache-control': 'private, no-store' };

export async function GET(): Promise<NextResponse> {
  const checkout = await getCheckoutByToken(await checkoutToken());
  if (!checkout) return NextResponse.json({ error: 'No active checkout.' }, { status: 404, headers: noStore });
  return NextResponse.json({ checkout: await checkoutView(checkout) }, { headers: noStore });
}

export async function PATCH(request: Request): Promise<NextResponse> {
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Cross-site request refused.' }, { status: 403 });
  const limit = rateLimit('checkout-update', clientAddress(request), 60, 60);
  if (!limit.allowed) return NextResponse.json({ error: 'Too many attempts. Try again shortly.' }, { status: 429 });

  const token = await checkoutToken();
  if (!token) return NextResponse.json({ error: 'No active checkout.' }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  try {
    const result = await updateCheckout(token, {
      email: body.email,
      recoveryConsent: body.recoveryConsent,
      shippingAddress: body.shippingAddress,
      shippingRateId: body.shippingRateId,
      discountCode: body.discountCode,
    });
    return NextResponse.json(
      {
        checkout: await checkoutView(result.checkout, result.shippingOptions),
        problems: result.problems,
        discountMessage: result.discountMessage,
      },
      { headers: noStore },
    );
  } catch (error) {
    if (error instanceof CheckoutError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === 'not_found' ? 404 : 409 });
    }
    console.error(`[checkout] update failed: ${(error as Error).message}`);
    return NextResponse.json({ error: 'Could not update your checkout. Try again.' }, { status: 500 });
  }
}

/** Back to the cart: release the held stock straight away. */
export async function DELETE(request: Request): Promise<NextResponse> {
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Cross-site request refused.' }, { status: 403 });
  const token = await checkoutToken();
  if (token) await cancelCheckout(token);
  await clearCheckoutCookie();
  return NextResponse.json({ ok: true });
}
