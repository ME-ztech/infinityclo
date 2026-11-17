/**
 * Checkout orchestration.
 *
 *   createCheckout        cart identities -> priced, stock-reserved checkout
 *   updateCheckout        contact, address, shipping method, discount code
 *   startPayment          raise a payment for exactly the checkout total
 *   handlePaymentEvent    signed provider webhook -> the order
 *
 * Rules this file holds to:
 *
 * - **The server prices everything.** The browser sends variant ids and
 *   quantities. Prices come from `product_variants`; shipping from
 *   `shipping_rates`; tax from `tax_rates`; discounts from `discounts`.
 * - **Stock is reserved when the checkout opens** and released when it expires,
 *   so the last unit cannot be sold twice.
 * - **An order is created in one place only:** `handlePaymentEvent`, from a
 *   signature-verified provider webhook whose amount equals the frozen total.
 *   No page load, redirect or client call can create or mark an order paid.
 * - **Everything is idempotent.** A replayed webhook, a double-clicked pay
 *   button and a retried request all converge on the same single order.
 */
import 'server-only';

import { and, eq, inArray, sql } from 'drizzle-orm';

import { priceOrder, type PricingDiscount } from '@/domain/pricing';
import { categoryGroupOf } from '@/domain/taxonomy';
import type { Product } from '@/domain/types';

import { getDb, schema, type Executor } from '../db/client';
import { hashToken, newId, newToken } from '../db/ids';
import type { AddressSnapshot, CheckoutLineSnapshot } from '../db/schema';
import { normaliseEmail } from '../security';

import { commitReservations, releaseExpiredReservations, releaseReservations, reserveStock } from './inventory';
import { getPaymentProvider, PaymentsNotConfiguredError, type PaymentEvent } from './payments';

const { checkouts, productVariants, products, productMedia, shippingRates, taxRates, discounts, orders, orderItems } =
  schema;

export type Checkout = typeof checkouts.$inferSelect;
export type ShippingRate = typeof shippingRates.$inferSelect;
export type Discount = typeof discounts.$inferSelect;

/** How long stock is held for an open checkout. */
export const CHECKOUT_TTL_MINUTES = 30;
export const MAX_QUANTITY_PER_LINE = 10;
export const MAX_LINES = 50;

export class CheckoutError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'empty'
      | 'unavailable'
      | 'not_found'
      | 'expired'
      | 'invalid'
      | 'no_shipping'
      | 'discount'
      | 'payments_unavailable',
  ) {
    super(message);
    this.name = 'CheckoutError';
  }
}

/* ------------------------------------------------------------------ *
 * Address
 * ------------------------------------------------------------------ */

const clean = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';

/** Validates and normalises a shipping address. Returns problems instead of throwing. */
export function parseAddress(input: unknown): { address: AddressSnapshot | null; problems: string[] } {
  const source = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const address: AddressSnapshot = {
    firstName: clean(source.firstName, 80),
    lastName: clean(source.lastName, 80),
    line1: clean(source.line1, 160),
    line2: clean(source.line2, 160),
    city: clean(source.city, 80),
    province: clean(source.province, 40).toUpperCase(),
    postalCode: clean(source.postalCode, 20).toUpperCase(),
    country: clean(source.country, 2).toUpperCase(),
    phone: clean(source.phone, 30) || null,
  };
  const problems: string[] = [];
  if (!address.firstName) problems.push('Enter a first name.');
  if (!address.lastName) problems.push('Enter a last name.');
  if (!address.line1) problems.push('Enter a street address.');
  if (!address.city) problems.push('Enter a city.');
  if (!/^[A-Z]{2}$/.test(address.country)) problems.push('Choose a country.');
  if (!address.postalCode) problems.push('Enter a postal or ZIP code.');
  if (address.country === 'CA') {
    if (!/^[A-Z]{2}$/.test(address.province)) problems.push('Choose a province.');
    if (!/^[A-Z]\d[A-Z] ?\d[A-Z]\d$/.test(address.postalCode)) problems.push('Enter a valid Canadian postal code.');
  }
  return { address: problems.length ? null : address, problems };
}

/* ------------------------------------------------------------------ *
 * Shipping, tax, discounts
 * ------------------------------------------------------------------ */

export async function shippingOptionsFor(executor: Executor, address: AddressSnapshot): Promise<ShippingRate[]> {
  const rates = await executor.select().from(shippingRates).where(eq(shippingRates.active, true));
  return rates
    .filter(
      (rate) =>
        (rate.countries.includes('*') || rate.countries.includes(address.country)) &&
        (rate.provinces.length === 0 || rate.provinces.includes(address.province)),
    )
    .sort((a, b) => a.position - b.position || a.priceCents - b.priceCents);
}

export async function hasShippingRates(): Promise<boolean> {
  const db = await getDb();
  const [row] = await db.select({ id: shippingRates.id }).from(shippingRates).where(eq(shippingRates.active, true)).limit(1);
  return Boolean(row);
}

async function taxRatesFor(executor: Executor, address: AddressSnapshot) {
  const rates = await executor
    .select()
    .from(taxRates)
    .where(and(eq(taxRates.active, true), eq(taxRates.country, address.country)));
  return rates.filter((rate) => rate.province === '' || rate.province === address.province);
}

const isLineEligible = (discount: Discount, line: CheckoutLineSnapshot): boolean => {
  if (discount.eligibility.excludeSaleItems && line.compareAtCents !== null && line.compareAtCents > line.unitPriceCents) {
    return false;
  }
  if (discount.eligibility.scope === 'products') return discount.eligibility.productSlugs.includes(line.productHandle);
  if (discount.eligibility.scope === 'categories') {
    return line.categoryGroup !== null && discount.eligibility.categories.includes(line.categoryGroup);
  }
  return true;
};

const inWindow = (discount: Discount, now: Date): boolean =>
  discount.status === 'active' &&
  (!discount.startsAt || discount.startsAt <= now) &&
  (!discount.endsAt || discount.endsAt > now) &&
  (discount.usageLimit === null || discount.usedCount < discount.usageLimit);

/**
 * Why a code cannot be used, or null when it can. Customer-specific rules are
 * only checkable once an email is known; until then they pass, and are checked
 * again when the email is set and once more when the order is created.
 */
async function discountProblem(executor: Executor, discount: Discount, email: string | null, now: Date): Promise<string | null> {
  if (!inWindow(discount, now)) return 'That code is not active.';
  if (!email) return null;
  if (discount.audience === 'first_order') {
    const [previous] = await executor.select({ id: orders.id }).from(orders).where(eq(orders.email, email)).limit(1);
    if (previous) return 'That code is for a first order only.';
  }
  if (discount.oncePerCustomer) {
    const [used] = await executor
      .select({ orderId: schema.discountRedemptions.orderId })
      .from(schema.discountRedemptions)
      .where(and(eq(schema.discountRedemptions.discountId, discount.id), eq(schema.discountRedemptions.email, email)))
      .limit(1);
    if (used) return 'That code has already been used with this email address.';
  }
  return null;
}

interface Repriced {
  readonly lines: CheckoutLineSnapshot[];
  readonly discount: Discount | null;
  readonly discountMessage: string | null;
  readonly shippingRate: ShippingRate | null;
  readonly totals: ReturnType<typeof priceOrder>;
}

/**
 * Recomputes a checkout from its parts. One discount applies: a valid code if
 * one was entered, otherwise the automatic discount that saves the most.
 */
async function reprice(
  executor: Executor,
  input: {
    lines: CheckoutLineSnapshot[];
    email: string | null;
    address: AddressSnapshot | null;
    shippingRateId: string | null;
    discountCode: string | null;
  },
  now: Date = new Date(),
): Promise<Repriced> {
  const price = (discount: Discount | null, rate: ShippingRate | null, taxes: Awaited<ReturnType<typeof taxRatesFor>>) =>
    priceOrder({
      lines: input.lines.map((line) => ({
        key: line.variantId,
        unitPriceCents: line.unitPriceCents,
        quantity: line.quantity,
        discountEligible: discount ? isLineEligible(discount, line) : false,
      })),
      discount: discount
        ? ({ percentOff: discount.percentOff, minQuantity: discount.minQuantity ?? 1 } satisfies PricingDiscount)
        : null,
      shipping: rate ? { priceCents: rate.priceCents, freeOverCents: rate.freeOverCents } : null,
      taxRates: taxes.map((tax) => ({ name: tax.name, rateBps: tax.rateBps, appliesToShipping: tax.appliesToShipping })),
    });

  const options = input.address ? await shippingOptionsFor(executor, input.address) : [];
  const shippingRate = options.find((rate) => rate.id === input.shippingRateId) ?? null;
  const taxes = input.address ? await taxRatesFor(executor, input.address) : [];

  let discount: Discount | null = null;
  let discountMessage: string | null = null;

  if (input.discountCode) {
    const [found] = await executor.select().from(discounts).where(eq(discounts.code, input.discountCode.toUpperCase()));
    if (!found || found.method !== 'code') {
      discountMessage = 'That code was not recognised.';
    } else {
      discountMessage = await discountProblem(executor, found, input.email, now);
      if (!discountMessage) {
        if (price(found, shippingRate, taxes).discountApplied) discount = found;
        else discountMessage = 'That code does not apply to the items in your cart.';
      }
    }
  }

  if (!discount) {
    const automatic = (await executor.select().from(discounts).where(eq(discounts.method, 'automatic'))).filter(
      (candidate) => inWindow(candidate, now) && candidate.audience === 'everyone',
    );
    let best = 0;
    for (const candidate of automatic) {
      const saving = price(candidate, shippingRate, taxes).discountCents;
      if (saving > best) {
        best = saving;
        discount = candidate;
      }
    }
  }

  const totals = price(discount, shippingRate, taxes);
  const lines = input.lines.map((line) => ({
    ...line,
    discountCents: totals.lines.find((priced) => priced.key === line.variantId)?.discountCents ?? 0,
  }));
  return { lines, discount: totals.discountApplied ? discount : null, discountMessage, shippingRate, totals };
}

/* ------------------------------------------------------------------ *
 * Create
 * ------------------------------------------------------------------ */

export interface CheckoutLineInput {
  readonly variantId: string;
  readonly quantity: number;
}

export async function createCheckout(input: {
  lines: readonly CheckoutLineInput[];
  customerId?: string | null;
  email?: string | null;
}): Promise<{ checkout: Checkout; token: string }> {
  const merged = new Map<string, number>();
  for (const line of input.lines.slice(0, MAX_LINES)) {
    if (typeof line.variantId !== 'string' || !Number.isInteger(line.quantity) || line.quantity < 1) continue;
    merged.set(line.variantId, Math.min(MAX_QUANTITY_PER_LINE, (merged.get(line.variantId) ?? 0) + line.quantity));
  }
  if (merged.size === 0) throw new CheckoutError('Your cart is empty.', 'empty');

  await releaseExpiredReservations();

  const db = await getDb();
  const now = new Date();
  const rows = await db
    .select({ variant: productVariants, product: products })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(inArray(productVariants.id, [...merged.keys()]));

  const publicRows = rows.filter(
    (row) => row.product.status === 'active' && (!row.product.publishAt || row.product.publishAt <= now),
  );
  if (publicRows.length !== merged.size) {
    throw new CheckoutError('Some items in your cart are no longer available. Review your cart and try again.', 'unavailable');
  }

  const media = await db
    .select()
    .from(productMedia)
    .where(
      inArray(
        productMedia.productId,
        publicRows.map((row) => row.product.id),
      ),
    );
  const imageFor = (productId: string, mediaId: string | null): string | null => {
    const own = media.filter((item) => item.productId === productId).sort((a, b) => a.position - b.position);
    return (own.find((item) => item.id === mediaId) ?? own[0])?.url ?? null;
  };

  const lines: CheckoutLineSnapshot[] = publicRows.map((row) => ({
    variantId: row.variant.id,
    productId: row.product.id,
    productHandle: row.product.handle,
    categoryGroup: categoryGroupOf({ name: row.product.title, category: row.product.productType || null } as Product),
    title: row.product.title,
    variantTitle: row.variant.title,
    sku: row.variant.sku,
    quantity: merged.get(row.variant.id)!,
    unitPriceCents: row.variant.priceCents,
    compareAtCents: row.variant.compareAtCents,
    discountCents: 0,
    imageUrl: imageFor(row.product.id, row.variant.mediaId),
  }));

  const email = normaliseEmail(input.email ?? null);
  const { token, hash } = newToken();
  const checkoutId = newId('chk');
  const expiresAt = new Date(now.getTime() + CHECKOUT_TTL_MINUTES * 60_000);

  const checkout = await db.transaction(async (tx) => {
    const repriced = await reprice(tx, { lines, email, address: null, shippingRateId: null, discountCode: null }, now);
    await reserveStock(tx, checkoutId, lines, expiresAt);
    const [created] = await tx
      .insert(checkouts)
      .values({
        id: checkoutId,
        tokenHash: hash,
        customerId: input.customerId ?? null,
        email,
        lines: repriced.lines,
        discountId: repriced.discount?.id ?? null,
        discountTitle: repriced.discount?.title ?? null,
        subtotalCents: repriced.totals.subtotalCents,
        discountCents: repriced.totals.discountCents,
        totalCents: repriced.totals.totalCents,
        currency: publicRows[0]!.variant.currency,
        expiresAt,
      })
      .returning();
    return created!;
  });

  return { checkout, token };
}

/* ------------------------------------------------------------------ *
 * Read and update
 * ------------------------------------------------------------------ */

export async function getCheckoutByToken(token: string | undefined | null): Promise<Checkout | null> {
  if (!token) return null;
  const db = await getDb();
  const [checkout] = await db.select().from(checkouts).where(eq(checkouts.tokenHash, hashToken(token)));
  return checkout ?? null;
}

const assertOpen = (checkout: Checkout | null | undefined, now: Date): Checkout => {
  if (!checkout) throw new CheckoutError('This checkout was not found.', 'not_found');
  if (checkout.status !== 'open' || checkout.expiresAt <= now) {
    throw new CheckoutError('This checkout has expired. Return to your cart to start again.', 'expired');
  }
  return checkout;
};

export interface CheckoutUpdate {
  readonly email?: unknown;
  readonly recoveryConsent?: unknown;
  readonly shippingAddress?: unknown;
  readonly shippingRateId?: unknown;
  /** Empty string removes the code. */
  readonly discountCode?: unknown;
}

export async function updateCheckout(
  token: string,
  update: CheckoutUpdate,
): Promise<{ checkout: Checkout; shippingOptions: ShippingRate[]; problems: string[]; discountMessage: string | null }> {
  const db = await getDb();
  const now = new Date();
  const problems: string[] = [];

  const result = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(checkouts).where(eq(checkouts.tokenHash, hashToken(token))).for('update');
    const checkout = assertOpen(current, now);

    let email = checkout.email;
    if (update.email !== undefined) {
      const parsed = normaliseEmail(update.email);
      if (parsed) email = parsed;
      else problems.push('Enter a valid email address.');
    }

    let address = checkout.shippingAddress;
    if (update.shippingAddress !== undefined) {
      const parsed = parseAddress(update.shippingAddress);
      if (parsed.address) address = parsed.address;
      else problems.push(...parsed.problems);
    }

    const options = address ? await shippingOptionsFor(tx, address) : [];
    let shippingRateId = checkout.shippingRateId;
    if (typeof update.shippingRateId === 'string') shippingRateId = update.shippingRateId;
    if (!options.some((rate) => rate.id === shippingRateId)) {
      // Keep a valid choice selected: the cheapest that serves the address.
      shippingRateId = options[0]?.id ?? null;
    }
    if (address && options.length === 0) problems.push('We do not currently ship to that address.');

    let discountCode = checkout.discountCode;
    if (typeof update.discountCode === 'string') discountCode = update.discountCode.trim().toUpperCase().slice(0, 40) || null;

    const repriced = await reprice(tx, { lines: checkout.lines, email, address, shippingRateId, discountCode }, now);

    const [saved] = await tx
      .update(checkouts)
      .set({
        email,
        recoveryConsent: typeof update.recoveryConsent === 'boolean' ? update.recoveryConsent : checkout.recoveryConsent,
        shippingAddress: address,
        shippingRateId: repriced.shippingRate?.id ?? null,
        shippingName: repriced.shippingRate?.name ?? null,
        // A code that did not apply is not kept, so it cannot resurface later.
        discountCode: repriced.discount?.method === 'code' ? repriced.discount.code : null,
        discountId: repriced.discount?.id ?? null,
        discountTitle: repriced.discount?.title ?? null,
        lines: repriced.lines,
        taxLines: [...repriced.totals.taxLines],
        subtotalCents: repriced.totals.subtotalCents,
        discountCents: repriced.totals.discountCents,
        shippingCents: repriced.totals.shippingCents,
        taxCents: repriced.totals.taxCents,
        totalCents: repriced.totals.totalCents,
        updatedAt: now,
      })
      .where(eq(checkouts.id, checkout.id))
      .returning();

    return { checkout: saved!, shippingOptions: options, discountMessage: repriced.discountMessage };
  });

  // Keep an already-raised payment in step with the new total.
  if (result.checkout.paymentRef) {
    await getPaymentProvider()?.updatePaymentAmount(result.checkout.paymentRef, result.checkout.totalCents);
  }

  return { ...result, problems };
}

/* ------------------------------------------------------------------ *
 * Payment
 * ------------------------------------------------------------------ */

export async function startPayment(
  token: string,
): Promise<{ checkout: Checkout; clientSecret: string; provider: 'stripe' | 'test'; publishableKey: string | null }> {
  const provider = getPaymentProvider();
  if (!provider) throw new PaymentsNotConfiguredError();

  const db = await getDb();
  const now = new Date();
  const checkout = assertOpen(await getCheckoutByToken(token), now);

  if (!checkout.email) throw new CheckoutError('Enter your email address.', 'invalid');
  if (!checkout.shippingAddress) throw new CheckoutError('Enter a shipping address.', 'invalid');
  if (!checkout.shippingRateId) throw new CheckoutError('Choose a shipping method.', 'no_shipping');
  if (checkout.totalCents <= 0) throw new CheckoutError('This order has nothing to pay.', 'invalid');

  // Idempotent on the provider side (keyed by checkout id): a second click
  // returns the same payment rather than raising another.
  const payment = await provider.createPayment({
    checkoutId: checkout.id,
    amountCents: checkout.totalCents,
    currency: checkout.currency,
    email: checkout.email,
    description: `INFNITY order (${checkout.lines.reduce((total, line) => total + line.quantity, 0)} items)`,
  });
  if (checkout.paymentRef && checkout.paymentRef === payment.ref) {
    await provider.updatePaymentAmount(payment.ref, checkout.totalCents);
  }

  const [saved] = await db
    .update(checkouts)
    .set({ paymentProvider: provider.name, paymentRef: payment.ref, updatedAt: now })
    .where(eq(checkouts.id, checkout.id))
    .returning();

  return { checkout: saved!, clientSecret: payment.clientSecret, provider: provider.name, publishableKey: provider.publishableKey };
}

export type PaymentEventOutcome =
  | { result: 'order_created'; orderId: string; orderName: string }
  | { result: 'duplicate' }
  | { result: 'ignored'; reason: string }
  | { result: 'payment_failed' };

/**
 * Turns an authenticated provider event into an order. The event id is claimed
 * first (primary-key insert), so a replay is a no-op; if anything below throws,
 * the transaction rolls the claim back and the provider's retry is processed.
 */
export async function handlePaymentEvent(event: PaymentEvent, providerName: string): Promise<PaymentEventOutcome> {
  const db = await getDb();

  return db.transaction(async (tx): Promise<PaymentEventOutcome> => {
    const claimed = await tx
      .insert(schema.webhookEvents)
      .values({
        id: `${providerName}:${event.eventId}`,
        provider: providerName,
        type: event.kind === 'ignored' ? event.type : event.kind,
        status: 'processed',
        processedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning({ id: schema.webhookEvents.id });
    if (claimed.length === 0) return { result: 'duplicate' };

    if (event.kind === 'ignored') return { result: 'ignored', reason: `Unhandled event type ${event.type}.` };

    const [checkout] = await tx.select().from(checkouts).where(eq(checkouts.paymentRef, event.ref)).for('update');
    if (!checkout) return { result: 'ignored', reason: 'No checkout matches this payment.' };

    if (event.kind === 'payment_failed') {
      // The customer may retry on the same checkout; stock stays held until expiry.
      return { result: 'payment_failed' };
    }

    // A second, different event for a checkout that already became an order.
    const [existing] = await tx.select().from(orders).where(eq(orders.checkoutId, checkout.id));
    if (existing) return { result: 'duplicate' };

    if (event.amountCents !== checkout.totalCents || event.currency !== checkout.currency) {
      // Never ship against a payment that does not match what was quoted.
      console.error(
        `[checkout] payment ${event.ref} is ${event.amountCents} ${event.currency}; checkout ${checkout.id} expects ${checkout.totalCents} ${checkout.currency}. No order created.`,
      );
      return { result: 'ignored', reason: 'Payment amount does not match the checkout total.' };
    }

    const orderId = newId('ord');
    const [order] = await tx
      .insert(orders)
      .values({
        id: orderId,
        name: '',
        customerId: checkout.customerId,
        email: checkout.email ?? '',
        paymentStatus: 'paid',
        currency: checkout.currency,
        subtotalCents: checkout.subtotalCents,
        discountCents: checkout.discountCents,
        shippingCents: checkout.shippingCents,
        taxCents: checkout.taxCents,
        totalCents: checkout.totalCents,
        taxLines: checkout.taxLines,
        discountId: checkout.discountId,
        discountCode: checkout.discountCode,
        shippingAddress: checkout.shippingAddress,
        shippingName: checkout.shippingName,
        checkoutId: checkout.id,
        paymentProvider: providerName,
        paymentRef: event.ref,
        test: event.test,
      })
      .returning();
    const name = `#${1000 + order!.number}`;
    await tx.update(orders).set({ name }).where(eq(orders.id, orderId));

    await tx.insert(orderItems).values(
      checkout.lines.map((line) => ({
        id: newId('oli'),
        orderId,
        variantId: line.variantId,
        productId: line.productId,
        title: line.title,
        variantTitle: line.variantTitle,
        sku: line.sku,
        imageUrl: line.imageUrl,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        discountCents: line.discountCents,
        totalCents: line.unitPriceCents * line.quantity - line.discountCents,
      })),
    );

    await tx.insert(schema.payments).values({
      id: newId('pay'),
      orderId,
      kind: 'charge',
      provider: providerName,
      providerRef: event.ref,
      amountCents: event.amountCents,
      currency: event.currency,
      status: 'succeeded',
    });

    const { oversold } = await commitReservations(tx, checkout.id, checkout.lines);

    if (checkout.discountId) {
      await tx
        .update(discounts)
        .set({ usedCount: sql`${discounts.usedCount} + 1`, updatedAt: new Date() })
        .where(eq(discounts.id, checkout.discountId));
      await tx
        .insert(schema.discountRedemptions)
        .values({ discountId: checkout.discountId, orderId, email: checkout.email ?? '' })
        .onConflictDoNothing();
    }

    await tx.insert(schema.orderEvents).values([
      { id: newId('evt'), orderId, type: 'placed', message: `Order placed and paid (${providerName}${event.test ? ', test mode' : ''}).` },
      ...(oversold.length
        ? [
            {
              id: newId('evt'),
              orderId,
              type: 'oversold',
              message:
                'Payment arrived after the stock hold expired and at least one item is no longer on the shelf. Review before fulfilling.',
            },
          ]
        : []),
    ]);

    await tx
      .update(checkouts)
      .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
      .where(eq(checkouts.id, checkout.id));

    return { result: 'order_created', orderId, orderName: name };
  });
}

/** Customer walked away or went back to the cart: give the stock back now. */
export async function cancelCheckout(token: string): Promise<void> {
  const db = await getDb();
  await db.transaction(async (tx) => {
    const [checkout] = await tx.select().from(checkouts).where(eq(checkouts.tokenHash, hashToken(token))).for('update');
    if (!checkout || checkout.status !== 'open') return;
    await releaseReservations(tx, checkout.id);
    await tx.update(checkouts).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(checkouts.id, checkout.id));
  });
}

/** The order a completed checkout became, for the confirmation page. */
export async function orderForCheckout(checkoutId: string) {
  const db = await getDb();
  const [order] = await db.select().from(orders).where(eq(orders.checkoutId, checkoutId));
  return order ?? null;
}
