/**
 * Payment providers.
 *
 * The commerce engine owns the order; a provider only moves money. Everything
 * the engine needs from one is behind `PaymentProvider`:
 *
 *   createPayment   raise a payment for an exact amount, for one checkout
 *   parseWebhook    authenticate a provider callback and say what it means
 *   refund          return money against an earlier payment
 *
 * Two implementations:
 *
 *   StripeProvider  Stripe PaymentIntents. Card data goes from the browser
 *                   straight to Stripe (Payment Element); this server never
 *                   sees it. Webhooks are signature-verified.
 *   TestProvider    A local stand-in used by automated tests and local
 *                   development. It is refused in production, and every order
 *                   it produces is flagged `test`.
 *
 * Idempotency: `createPayment` is keyed by checkout id, `refund` by a caller
 * supplied key, so a retried request never charges or refunds twice.
 */
import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

export interface PaymentRequest {
  readonly checkoutId: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly email: string | null;
  readonly description: string;
}

export interface CreatedPayment {
  /** Provider reference for the payment (Stripe PaymentIntent id). */
  readonly ref: string;
  /** Handed to the browser to confirm the payment. Never logged. */
  readonly clientSecret: string;
}

export type PaymentEvent =
  | { kind: 'payment_succeeded'; eventId: string; ref: string; amountCents: number; currency: string; test: boolean }
  | { kind: 'payment_failed'; eventId: string; ref: string }
  | { kind: 'ignored'; eventId: string; type: string };

export interface RefundRequest {
  readonly ref: string;
  readonly amountCents: number;
  readonly idempotencyKey: string;
  readonly reason: string;
}

export interface PaymentProvider {
  readonly name: 'stripe' | 'test';
  /** Safe to send to the browser. */
  readonly publishableKey: string | null;
  createPayment(request: PaymentRequest): Promise<CreatedPayment>;
  /** Changes the amount of an unconfirmed payment (totals changed at checkout). */
  updatePaymentAmount(ref: string, amountCents: number): Promise<void>;
  /** Throws `PaymentSignatureError` when the callback is not authentic. */
  parseWebhook(rawBody: string, signature: string | null): PaymentEvent;
  refund(input: RefundRequest): Promise<{ refundRef: string }>;
}

export class PaymentSignatureError extends Error {
  constructor() {
    super('Webhook signature verification failed.');
    this.name = 'PaymentSignatureError';
  }
}

export class PaymentsNotConfiguredError extends Error {
  constructor() {
    super('No payment provider is configured.');
    this.name = 'PaymentsNotConfiguredError';
  }
}

const equalHex = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

/* ------------------------------------------------------------------ *
 * Stripe
 * ------------------------------------------------------------------ */

type StripeClient = import('stripe').default;

/** Stripe signs `${timestamp}.${body}` with HMAC-SHA256. */
export function stripeSignature(secret: string, rawBody: string, timestamp: number): string {
  const digest = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return `t=${timestamp},v1=${digest}`;
}

export class StripeProvider implements PaymentProvider {
  readonly name = 'stripe' as const;
  private clientPromise: Promise<StripeClient> | null = null;

  constructor(
    private readonly secretKey: string,
    readonly publishableKey: string | null,
    private readonly webhookSecret: string | null,
    private readonly injected?: StripeClient,
  ) {}

  private client(): Promise<StripeClient> {
    if (this.injected) return Promise.resolve(this.injected);
    this.clientPromise ??= import('stripe').then(({ default: Stripe }) => new Stripe(this.secretKey));
    return this.clientPromise;
  }

  async createPayment(request: PaymentRequest): Promise<CreatedPayment> {
    const stripe = await this.client();
    const intent = await stripe.paymentIntents.create(
      {
        amount: request.amountCents,
        currency: request.currency.toLowerCase(),
        automatic_payment_methods: { enabled: true },
        receipt_email: request.email ?? undefined,
        description: request.description,
        metadata: { checkout_id: request.checkoutId },
      },
      { idempotencyKey: `checkout:${request.checkoutId}` },
    );
    if (!intent.client_secret) throw new Error('Stripe did not return a client secret.');
    return { ref: intent.id, clientSecret: intent.client_secret };
  }

  async updatePaymentAmount(ref: string, amountCents: number): Promise<void> {
    const stripe = await this.client();
    await stripe.paymentIntents.update(ref, { amount: amountCents });
  }

  /**
   * Verifies the `Stripe-Signature` header (HMAC over timestamp and raw body,
   * five-minute tolerance against replay) and classifies the event.
   */
  parseWebhook(rawBody: string, signature: string | null): PaymentEvent {
    if (!this.webhookSecret || !signature) throw new PaymentSignatureError();
    const parts = signature.split(',').map((part) => part.trim());
    const timestamp = Number(parts.find((part) => part.startsWith('t='))?.slice(2));
    const provided = parts.filter((part) => part.startsWith('v1=')).map((part) => part.slice(3));
    if (!Number.isFinite(timestamp) || provided.length === 0) throw new PaymentSignatureError();
    if (Math.abs(Date.now() / 1000 - timestamp) > 300) throw new PaymentSignatureError();
    const expected = createHmac('sha256', this.webhookSecret).update(`${timestamp}.${rawBody}`).digest('hex');
    if (!provided.some((candidate) => equalHex(candidate, expected))) throw new PaymentSignatureError();

    const event = JSON.parse(rawBody) as {
      id: string;
      type: string;
      livemode?: boolean;
      data: { object: { id: string; amount_received?: number; amount?: number; currency?: string } };
    };
    const object = event.data.object;
    if (event.type === 'payment_intent.succeeded') {
      return {
        kind: 'payment_succeeded',
        eventId: event.id,
        ref: object.id,
        amountCents: object.amount_received ?? object.amount ?? 0,
        currency: (object.currency ?? 'cad').toUpperCase(),
        test: event.livemode === false,
      };
    }
    if (event.type === 'payment_intent.payment_failed' || event.type === 'payment_intent.canceled') {
      return { kind: 'payment_failed', eventId: event.id, ref: object.id };
    }
    return { kind: 'ignored', eventId: event.id, type: event.type };
  }

  async refund(input: RefundRequest): Promise<{ refundRef: string }> {
    const stripe = await this.client();
    const refund = await stripe.refunds.create(
      { payment_intent: input.ref, amount: input.amountCents, metadata: { reason: input.reason.slice(0, 400) } },
      { idempotencyKey: input.idempotencyKey },
    );
    return { refundRef: refund.id };
  }
}

/* ------------------------------------------------------------------ *
 * Test provider
 * ------------------------------------------------------------------ */

const TEST_SECRET = 'infnity-test-payments';

/**
 * Deterministic local provider. A "payment" is confirmed by posting a webhook
 * signed with a fixed development secret — which is exactly why it must never
 * run in production: `paymentMode` refuses to select it there.
 */
export class TestProvider implements PaymentProvider {
  readonly name = 'test' as const;
  readonly publishableKey = null;
  readonly refunds: RefundRequest[] = [];

  async createPayment(request: PaymentRequest): Promise<CreatedPayment> {
    return { ref: `test_pi_${request.checkoutId}`, clientSecret: `test_secret_${request.checkoutId}` };
  }

  async updatePaymentAmount(): Promise<void> {}

  static sign(rawBody: string): string {
    return createHmac('sha256', TEST_SECRET).update(rawBody).digest('hex');
  }

  /** Builds the webhook a successful (or failed) test payment would send. */
  static event(input: { ref: string; amountCents: number; currency?: string; failed?: boolean; eventId?: string }) {
    const rawBody = JSON.stringify({
      id: input.eventId ?? `test_evt_${input.ref}_${input.failed ? 'failed' : 'ok'}`,
      type: input.failed ? 'payment_failed' : 'payment_succeeded',
      ref: input.ref,
      amountCents: input.amountCents,
      currency: input.currency ?? 'CAD',
    });
    return { rawBody, signature: TestProvider.sign(rawBody) };
  }

  parseWebhook(rawBody: string, signature: string | null): PaymentEvent {
    if (!equalHex(TestProvider.sign(rawBody), signature ?? '')) throw new PaymentSignatureError();
    const event = JSON.parse(rawBody) as { id: string; type: string; ref: string; amountCents: number; currency: string };
    if (event.type === 'payment_succeeded') {
      return {
        kind: 'payment_succeeded',
        eventId: event.id,
        ref: event.ref,
        amountCents: event.amountCents,
        currency: event.currency,
        test: true,
      };
    }
    if (event.type === 'payment_failed') return { kind: 'payment_failed', eventId: event.id, ref: event.ref };
    return { kind: 'ignored', eventId: event.id, type: event.type };
  }

  async refund(input: RefundRequest): Promise<{ refundRef: string }> {
    if (!this.refunds.some((refund) => refund.idempotencyKey === input.idempotencyKey)) this.refunds.push(input);
    return { refundRef: `test_re_${input.idempotencyKey}` };
  }
}

/* ------------------------------------------------------------------ *
 * Selection
 * ------------------------------------------------------------------ */

const globalPayments = globalThis as typeof globalThis & { __infnityPayments?: PaymentProvider | null };

export type PaymentMode = 'stripe-live' | 'stripe-test' | 'test' | 'not_configured';

/**
 * `test` is available only outside production, or in a production *build* that
 * the E2E harness has explicitly marked with INFNITY_E2E=1. A real deployment
 * sets neither, so it can never accept a simulated payment.
 */
export function paymentMode(): PaymentMode {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (key) return key.startsWith('sk_live_') ? 'stripe-live' : 'stripe-test';
  if (process.env.PAYMENTS_PROVIDER === 'test') {
    if (process.env.NODE_ENV !== 'production' || process.env.INFNITY_E2E === '1') return 'test';
  }
  return 'not_configured';
}

/** The configured provider, or null when checkout cannot take payment. */
export function getPaymentProvider(): PaymentProvider | null {
  if (globalPayments.__infnityPayments !== undefined) return globalPayments.__infnityPayments;
  const mode = paymentMode();
  let provider: PaymentProvider | null = null;
  if (mode === 'stripe-live' || mode === 'stripe-test') {
    provider = new StripeProvider(
      process.env.STRIPE_SECRET_KEY!.trim(),
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ?? null,
      process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? null,
    );
  } else if (mode === 'test') {
    provider = new TestProvider();
  }
  globalPayments.__infnityPayments = provider;
  return provider;
}

export function setPaymentProviderForTesting(provider: PaymentProvider | null | undefined): void {
  globalPayments.__infnityPayments = provider;
}
