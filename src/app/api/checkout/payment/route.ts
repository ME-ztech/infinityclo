/**
 * Raise the payment for the active checkout.
 *
 * Returns what the browser needs to confirm it with the provider (for Stripe,
 * a client secret for the Payment Element). The amount is whatever the server
 * last computed for this checkout; the client cannot supply or alter it.
 */
import { NextResponse } from 'next/server';

import { CheckoutError, startPayment } from '@/server/commerce/checkout';
import { PaymentsNotConfiguredError } from '@/server/commerce/payments';
import { checkoutToken } from '@/server/commerce/session';
import { clientAddress, isSameOrigin, rateLimit } from '@/server/security';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Cross-site request refused.' }, { status: 403 });
  const limit = rateLimit('checkout-pay', clientAddress(request), 15, 60);
  if (!limit.allowed) return NextResponse.json({ error: 'Too many attempts. Try again shortly.' }, { status: 429 });

  const token = await checkoutToken();
  if (!token) return NextResponse.json({ error: 'No active checkout.' }, { status: 404 });

  try {
    const payment = await startPayment(token);
    return NextResponse.json(
      {
        provider: payment.provider,
        clientSecret: payment.clientSecret,
        publishableKey: payment.publishableKey,
        totalCents: payment.checkout.totalCents,
        currency: payment.checkout.currency,
      },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    if (error instanceof PaymentsNotConfiguredError) {
      return NextResponse.json({ error: 'Payment is not available right now.', code: 'payments_unavailable' }, { status: 503 });
    }
    if (error instanceof CheckoutError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    }
    console.error(`[checkout] payment could not start: ${(error as Error).message}`);
    return NextResponse.json({ error: 'Payment could not be started. Try again.' }, { status: 502 });
  }
}
