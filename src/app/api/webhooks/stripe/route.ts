/**
 * Stripe webhook.
 *
 * This is the only place an order is ever created. The request is trusted for
 * one reason: its `Stripe-Signature` header verifies against the endpoint's
 * signing secret over the *raw* body, within a five-minute window.
 *
 * Responses follow Stripe's retry contract:
 *   2xx  handled, or a duplicate / irrelevant event — do not retry.
 *   401  signature failed — not from Stripe.
 *   5xx  something broke while handling — retry later. The event claim is
 *        rolled back with the failed transaction, so the retry is processed.
 *
 * Subscribe this endpoint to: payment_intent.succeeded,
 * payment_intent.payment_failed, payment_intent.canceled.
 */
import { NextResponse } from 'next/server';

import { processPaymentWebhook } from '@/server/commerce/service';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  // The raw text, exactly as sent: re-serialised JSON would not verify.
  const rawBody = await request.text();
  try {
    const result = await processPaymentWebhook(rawBody, request.headers.get('stripe-signature'));
    if (result.status !== 200) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ received: true, result: result.outcome.result });
  } catch (error) {
    console.error(`[webhook:stripe] handling failed: ${(error as Error).message}`);
    return NextResponse.json({ error: 'Handling failed; retry.' }, { status: 500 });
  }
}
