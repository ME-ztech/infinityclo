/**
 * Glue between the commerce engine and HTTP: readiness, the checkout view sent
 * to the browser, and what happens after a payment webhook.
 */
import 'server-only';

import { revalidatePath } from 'next/cache';

import { isDatabaseConfigured } from '../db/client';

import {
  handlePaymentEvent,
  hasShippingRates,
  shippingOptionsFor,
  type Checkout,
  type PaymentEventOutcome,
  type ShippingRate,
} from './checkout';
import { orderConfirmationEmail, sendEmail } from './emails';
import { getOrder } from './orders';
import { getPaymentProvider, paymentMode, PaymentSignatureError } from './payments';
import { getDb } from '../db/client';

export interface CheckoutReadiness {
  readonly open: boolean;
  /** Why checkout is closed, for the customer. Null when open. */
  readonly message: string | null;
  /** The same, for the operator: exactly what to configure. */
  readonly missing: readonly string[];
}

/**
 * Whether an order can actually be taken right now. Checkout stays closed —
 * visibly, with a reason — until there is a database, a payment provider and
 * at least one shipping rate. It never opens onto a flow that cannot finish.
 */
export async function checkoutReadiness(): Promise<CheckoutReadiness> {
  const missing: string[] = [];
  if (!isDatabaseConfigured()) missing.push('Commerce database (DATABASE_URL)');
  if (paymentMode() === 'not_configured') missing.push('Payment provider (Stripe keys)');
  if (isDatabaseConfigured()) {
    try {
      if (!(await hasShippingRates())) missing.push('At least one shipping rate (Admin → Settings → Shipping)');
    } catch {
      missing.push('Commerce database is unreachable');
    }
  }
  return {
    open: missing.length === 0,
    message: missing.length ? 'Checkout is not open yet. Your cart is saved — please check back soon.' : null,
    missing,
  };
}

export interface CheckoutView {
  readonly status: Checkout['status'];
  readonly expiresAt: string;
  readonly email: string | null;
  readonly recoveryConsent: boolean;
  readonly shippingAddress: Checkout['shippingAddress'];
  readonly shippingRateId: string | null;
  readonly shippingOptions: ReadonlyArray<{
    id: string;
    name: string;
    priceCents: number;
    freeOverCents: number | null;
    deliveryEstimate: string | null;
  }>;
  readonly lines: ReadonlyArray<{
    title: string;
    variantTitle: string;
    quantity: number;
    unitPriceCents: number;
    discountCents: number;
    imageUrl: string | null;
  }>;
  readonly discountCode: string | null;
  readonly discountTitle: string | null;
  readonly subtotalCents: number;
  readonly discountCents: number;
  readonly shippingCents: number;
  readonly taxLines: Checkout['taxLines'];
  readonly taxCents: number;
  readonly totalCents: number;
  readonly currency: string;
  readonly paymentStarted: boolean;
}

/** The checkout as the browser may see it: no ids, tokens or internal refs. */
export async function checkoutView(checkout: Checkout, options?: ShippingRate[]): Promise<CheckoutView> {
  const shippingOptions =
    options ?? (checkout.shippingAddress ? await shippingOptionsFor(await getDb(), checkout.shippingAddress) : []);
  return {
    status: checkout.status,
    expiresAt: checkout.expiresAt.toISOString(),
    email: checkout.email,
    recoveryConsent: checkout.recoveryConsent,
    shippingAddress: checkout.shippingAddress,
    shippingRateId: checkout.shippingRateId,
    shippingOptions: shippingOptions.map((rate) => ({
      id: rate.id,
      name: rate.name,
      priceCents: rate.priceCents,
      freeOverCents: rate.freeOverCents,
      deliveryEstimate: rate.deliveryEstimate,
    })),
    lines: checkout.lines.map((line) => ({
      title: line.title,
      variantTitle: line.variantTitle,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      discountCents: line.discountCents,
      imageUrl: line.imageUrl,
    })),
    discountCode: checkout.discountCode,
    discountTitle: checkout.discountTitle,
    subtotalCents: checkout.subtotalCents,
    discountCents: checkout.discountCents,
    shippingCents: checkout.shippingCents,
    taxLines: checkout.taxLines,
    taxCents: checkout.taxCents,
    totalCents: checkout.totalCents,
    currency: checkout.currency,
    paymentStarted: checkout.paymentRef !== null,
  };
}

export type WebhookResult = { status: 200; outcome: PaymentEventOutcome } | { status: 400 | 401 | 503; error: string };

/**
 * Authenticates a provider callback and applies it. After a new order:
 * the confirmation email goes out once, and catalogue pages are refreshed so
 * availability reflects the sale.
 *
 * Any failure after authentication throws, which the route turns into a 5xx so
 * the provider retries; the event claim was rolled back with the transaction.
 */
export async function processPaymentWebhook(rawBody: string, signature: string | null): Promise<WebhookResult> {
  const provider = getPaymentProvider();
  if (!provider) return { status: 503, error: 'Payments are not configured.' };

  let event;
  try {
    event = provider.parseWebhook(rawBody, signature);
  } catch (error) {
    if (error instanceof PaymentSignatureError) return { status: 401, error: 'Invalid signature.' };
    return { status: 400, error: 'Malformed event.' };
  }

  const outcome = await handlePaymentEvent(event, provider.name);

  if (outcome.result === 'order_created') {
    const detail = await getOrder(outcome.orderId);
    if (detail?.order.email) await sendEmail(orderConfirmationEmail(detail));
    try {
      revalidatePath('/', 'layout');
    } catch {
      // Outside a request (tests, scripts) there is nothing to revalidate.
    }
  }
  return { status: 200, outcome };
}
