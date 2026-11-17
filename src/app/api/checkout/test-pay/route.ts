/**
 * Simulated payment — development and automated tests only.
 *
 * Exists so the whole purchase flow can be exercised without a card network.
 * It answers 404 unless the test payment provider is active, which
 * `paymentMode()` only allows outside production (or in the E2E harness's
 * explicitly marked build). It goes through the same signed-webhook path as a
 * real payment, so what it proves is the real order-creation code.
 */
import { NextResponse } from 'next/server';

import { getCheckoutByToken } from '@/server/commerce/checkout';
import { TestProvider, paymentMode } from '@/server/commerce/payments';
import { processPaymentWebhook } from '@/server/commerce/service';
import { checkoutToken } from '@/server/commerce/session';
import { isSameOrigin } from '@/server/security';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  if (paymentMode() !== 'test') return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Cross-site request refused.' }, { status: 403 });

  const checkout = await getCheckoutByToken(await checkoutToken());
  if (!checkout?.paymentRef) return NextResponse.json({ error: 'Start payment first.' }, { status: 409 });

  const body = (await request.json().catch(() => ({}))) as { fail?: boolean };
  const event = TestProvider.event({
    ref: checkout.paymentRef,
    amountCents: checkout.totalCents,
    currency: checkout.currency,
    failed: body.fail === true,
  });
  const result = await processPaymentWebhook(event.rawBody, event.signature);
  return NextResponse.json(result.status === 200 ? { result: result.outcome.result } : { error: result.error }, {
    status: result.status,
  });
}
