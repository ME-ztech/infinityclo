// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDb, schema, useMemoryDatabaseForTesting } from '../db/client';

import {
  CheckoutError,
  cancelCheckout,
  createCheckout,
  getCheckoutByToken,
  handlePaymentEvent,
  parseAddress,
  startPayment,
  updateCheckout,
} from './checkout';
import { InsufficientStockError, releaseExpiredReservations } from './inventory';
import { TestProvider, setPaymentProviderForTesting } from './payments';
import { ADDRESS, levelOf, seedDiscount, seedProduct, seedShippingRate, seedTaxRate } from './test-helpers';

const provider = new TestProvider();

beforeEach(async () => {
  await useMemoryDatabaseForTesting();
  setPaymentProviderForTesting(provider);
  await seedProduct({
    handle: 'hoodie',
    title: 'Blank Hoodie',
    variants: [
      { id: 'v_hoodie_m', title: 'M', priceCents: 6000, onHand: 2 },
      { id: 'v_hoodie_l', title: 'L', priceCents: 6000, onHand: 0 },
    ],
  });
  await seedProduct({ handle: 'tee', title: 'Graphic Tee', variants: [{ id: 'v_tee_m', priceCents: 4500, onHand: 5 }] });
});

/** Drives a checkout to the point where payment can be raised. */
async function readyCheckout(lines = [{ variantId: 'v_hoodie_m', quantity: 1 }]) {
  const rateId = await seedShippingRate();
  const { token } = await createCheckout({ lines });
  const updated = await updateCheckout(token, {
    email: 'buyer@example.com',
    shippingAddress: ADDRESS,
    shippingRateId: rateId,
  });
  return { token, checkout: updated.checkout };
}

async function pay(token: string) {
  const { checkout } = await startPayment(token);
  const event = TestProvider.event({ ref: checkout.paymentRef!, amountCents: checkout.totalCents });
  return { checkout, event: provider.parseWebhook(event.rawBody, event.signature) };
}

describe('createCheckout', () => {
  it('prices from the database and reserves stock', async () => {
    const { checkout, token } = await createCheckout({ lines: [{ variantId: 'v_hoodie_m', quantity: 2 }] });
    expect(checkout.subtotalCents).toBe(12000);
    expect(checkout.totalCents).toBe(12000);
    expect(checkout.lines[0]).toMatchObject({ title: 'Blank Hoodie', variantTitle: 'M', unitPriceCents: 6000 });
    expect(await levelOf('v_hoodie_m')).toMatchObject({ onHand: 2, reserved: 2 });
    expect((await getCheckoutByToken(token))!.id).toBe(checkout.id);
    expect(await getCheckoutByToken('wrong-token')).toBeNull();
  });

  it('refuses a sold-out variant and reserves nothing', async () => {
    await expect(
      createCheckout({
        lines: [
          { variantId: 'v_tee_m', quantity: 1 },
          { variantId: 'v_hoodie_l', quantity: 1 },
        ],
      }),
    ).rejects.toBeInstanceOf(InsufficientStockError);
    // The tee was reserved first and must have been rolled back.
    expect((await levelOf('v_tee_m')).reserved).toBe(0);
  });

  it('will not let two checkouts take the last units', async () => {
    await createCheckout({ lines: [{ variantId: 'v_hoodie_m', quantity: 2 }] });
    await expect(createCheckout({ lines: [{ variantId: 'v_hoodie_m', quantity: 1 }] })).rejects.toBeInstanceOf(
      InsufficientStockError,
    );
  });

  it('refuses unknown, draft and not-yet-launched products', async () => {
    await seedProduct({ handle: 'draft', status: 'draft', variants: [{ id: 'v_draft', priceCents: 100, onHand: 5 }] });
    await seedProduct({
      handle: 'later',
      publishAt: new Date(Date.now() + 86_400_000),
      variants: [{ id: 'v_later', priceCents: 100, onHand: 5 }],
    });
    for (const variantId of ['v_missing', 'v_draft', 'v_later']) {
      await expect(createCheckout({ lines: [{ variantId, quantity: 1 }] })).rejects.toMatchObject({
        code: 'unavailable',
      });
    }
  });

  it('sells a scheduled product once its launch time has passed', async () => {
    await seedProduct({
      handle: 'launched',
      publishAt: new Date(Date.now() - 1000),
      variants: [{ id: 'v_launched', priceCents: 100, onHand: 1 }],
    });
    await expect(createCheckout({ lines: [{ variantId: 'v_launched', quantity: 1 }] })).resolves.toBeDefined();
  });

  it('lets a pre-order product sell beyond on-hand stock', async () => {
    await seedProduct({ handle: 'pre', preorder: true, variants: [{ id: 'v_pre', priceCents: 100, onHand: 0 }] });
    await expect(createCheckout({ lines: [{ variantId: 'v_pre', quantity: 3 }] })).resolves.toBeDefined();
  });

  it('rejects an empty cart and caps quantity per line', async () => {
    await expect(createCheckout({ lines: [] })).rejects.toMatchObject({ code: 'empty' });
    await expect(createCheckout({ lines: [{ variantId: 'v_tee_m', quantity: 0 }] })).rejects.toMatchObject({
      code: 'empty',
    });
    const { checkout } = await createCheckout({ lines: [{ variantId: 'v_tee_m', quantity: 4 }] });
    expect(checkout.lines[0]!.quantity).toBe(4);
  });
});

describe('updateCheckout', () => {
  it('adds shipping and tax for the destination', async () => {
    await seedTaxRate({ name: 'GST', rateBps: 500 });
    await seedTaxRate({ name: 'RST', rateBps: 700, province: 'MB', appliesToShipping: false });
    await seedTaxRate({ name: 'HST', rateBps: 1300, province: 'ON' });
    const { checkout } = await readyCheckout();
    // 60.00 + 15.00 shipping; GST 5% of 75.00 = 3.75; RST 7% of 60.00 = 4.20
    expect(checkout.shippingCents).toBe(1500);
    expect(checkout.taxLines).toEqual([
      { name: 'GST', rateBps: 500, amountCents: 375 },
      { name: 'RST', rateBps: 700, amountCents: 420 },
    ]);
    expect(checkout.totalCents).toBe(6000 + 1500 + 795);
  });

  it('charges no tax when no rate is configured', async () => {
    const { checkout } = await readyCheckout();
    expect(checkout.taxCents).toBe(0);
    expect(checkout.totalCents).toBe(7500);
  });

  it('reports an address nothing ships to', async () => {
    await seedShippingRate();
    const { token } = await createCheckout({ lines: [{ variantId: 'v_tee_m', quantity: 1 }] });
    const result = await updateCheckout(token, {
      shippingAddress: { ...ADDRESS, country: 'FR', province: '', postalCode: '75001' },
    });
    expect(result.shippingOptions).toHaveLength(0);
    expect(result.problems).toContain('We do not currently ship to that address.');
  });

  it('makes shipping free at the configured threshold', async () => {
    const rateId = await seedShippingRate({ freeOverCents: 5000 });
    const { token } = await createCheckout({ lines: [{ variantId: 'v_hoodie_m', quantity: 1 }] });
    const { checkout } = await updateCheckout(token, { shippingAddress: ADDRESS, shippingRateId: rateId });
    expect(checkout.shippingCents).toBe(0);
  });

  it('applies a valid code and explains an invalid one', async () => {
    await seedDiscount();
    const { token } = await readyCheckout();
    const applied = await updateCheckout(token, { discountCode: 'ten' });
    expect(applied.checkout.discountCents).toBe(600);
    expect(applied.checkout.discountCode).toBe('TEN');
    expect(applied.checkout.lines[0]!.discountCents).toBe(600);

    const rejected = await updateCheckout(token, { discountCode: 'NOPE' });
    expect(rejected.discountMessage).toBe('That code was not recognised.');
    expect(rejected.checkout.discountCents).toBe(0);
    expect(rejected.checkout.discountCode).toBeNull();
  });

  it('refuses a paused, expired or exhausted code', async () => {
    await seedDiscount({ id: 'd1', code: 'PAUSED', status: 'paused' });
    await seedDiscount({ id: 'd2', code: 'OLD', endsAt: new Date(Date.now() - 1000) });
    await seedDiscount({ id: 'd3', code: 'USED', usageLimit: 1, usedCount: 1 });
    const { token } = await readyCheckout();
    for (const code of ['PAUSED', 'OLD', 'USED']) {
      const result = await updateCheckout(token, { discountCode: code });
      expect(result.discountMessage).toBe('That code is not active.');
      expect(result.checkout.discountCents).toBe(0);
    }
  });

  it('applies an automatic bundle only once the quantity is reached', async () => {
    await seedDiscount({ kind: 'bundle', method: 'automatic', code: null, percentOff: 15, minQuantity: 2 });
    const single = await readyCheckout([{ variantId: 'v_tee_m', quantity: 1 }]);
    expect(single.checkout.discountCents).toBe(0);

    await cancelCheckout(single.token);
    const pair = await readyCheckout([
      { variantId: 'v_tee_m', quantity: 1 },
      { variantId: 'v_hoodie_m', quantity: 1 },
    ]);
    expect(pair.checkout.discountCents).toBe(675 + 900);
  });

  it('validates email and address', async () => {
    const { token } = await createCheckout({ lines: [{ variantId: 'v_tee_m', quantity: 1 }] });
    const result = await updateCheckout(token, { email: 'nope', shippingAddress: { country: 'CA' } });
    expect(result.problems).toContain('Enter a valid email address.');
    expect(result.problems).toContain('Enter a valid Canadian postal code.');
    expect(parseAddress(ADDRESS).problems).toEqual([]);
  });
});

describe('payment and order creation', () => {
  it('requires contact, address and a shipping method before payment', async () => {
    const { token } = await createCheckout({ lines: [{ variantId: 'v_tee_m', quantity: 1 }] });
    await expect(startPayment(token)).rejects.toBeInstanceOf(CheckoutError);
  });

  it('refuses to start payment when no provider is configured', async () => {
    const { token } = await readyCheckout();
    setPaymentProviderForTesting(null);
    await expect(startPayment(token)).rejects.toThrow('No payment provider is configured.');
  });

  it('creates exactly one paid order from a verified payment', async () => {
    await seedTaxRate();
    const { token } = await readyCheckout([{ variantId: 'v_hoodie_m', quantity: 2 }]);
    const { checkout, event } = await pay(token);

    const outcome = await handlePaymentEvent(event, 'test');
    expect(outcome.result).toBe('order_created');

    const db = await getDb();
    const orders = await db.select().from(schema.orders);
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      name: '#1001',
      paymentStatus: 'paid',
      fulfillmentStatus: 'unfulfilled',
      totalCents: checkout.totalCents,
      email: 'buyer@example.com',
      test: true,
    });
    const items = await db.select().from(schema.orderItems);
    expect(items[0]).toMatchObject({ title: 'Blank Hoodie', quantity: 2, unitPriceCents: 6000, totalCents: 12000 });
    expect(await db.select().from(schema.payments)).toHaveLength(1);
    // Paid but not shipped: still on the shelf, still reserved.
    expect(await levelOf('v_hoodie_m')).toMatchObject({ onHand: 2, reserved: 2 });
    expect((await getCheckoutByToken(token))!.status).toBe('completed');
  });

  it('treats a replayed webhook as a no-op', async () => {
    const { token } = await readyCheckout();
    const { event } = await pay(token);
    expect((await handlePaymentEvent(event, 'test')).result).toBe('order_created');
    expect((await handlePaymentEvent(event, 'test')).result).toBe('duplicate');
    // A different event id for the same payment must not create a second order either.
    expect((await handlePaymentEvent({ ...event, eventId: 'another' }, 'test')).result).toBe('duplicate');
    const db = await getDb();
    expect(await db.select().from(schema.orders)).toHaveLength(1);
  });

  it('creates no order when the paid amount differs from the quoted total', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { token } = await readyCheckout();
    const { event } = await pay(token);
    const tampered = { ...event, amountCents: 100 } as typeof event;
    expect((await handlePaymentEvent(tampered, 'test')).result).toBe('ignored');
    const db = await getDb();
    expect(await db.select().from(schema.orders)).toHaveLength(0);
    quiet.mockRestore();
  });

  it('rejects a forged webhook signature', () => {
    const event = TestProvider.event({ ref: 'test_pi_x', amountCents: 100 });
    expect(() => provider.parseWebhook(event.rawBody, 'deadbeef')).toThrow('signature');
    expect(() => provider.parseWebhook(event.rawBody.replace('100', '1'), event.signature)).toThrow('signature');
  });

  it('leaves the checkout open after a failed payment so the customer can retry', async () => {
    const { token } = await readyCheckout();
    const { checkout } = await startPayment(token);
    const failed = TestProvider.event({ ref: checkout.paymentRef!, amountCents: checkout.totalCents, failed: true });
    expect((await handlePaymentEvent(provider.parseWebhook(failed.rawBody, failed.signature), 'test')).result).toBe(
      'payment_failed',
    );
    expect((await getCheckoutByToken(token))!.status).toBe('open');
    const { event } = await pay(token);
    expect((await handlePaymentEvent(event, 'test')).result).toBe('order_created');
  });

  it('counts discount usage and enforces once-per-customer on the next order', async () => {
    const discountId = await seedDiscount({ oncePerCustomer: true });
    const first = await readyCheckout([{ variantId: 'v_tee_m', quantity: 1 }]);
    await updateCheckout(first.token, { discountCode: 'TEN' });
    const { event } = await pay(first.token);
    await handlePaymentEvent(event, 'test');

    const db = await getDb();
    const [discount] = await db.select().from(schema.discounts);
    expect(discount).toMatchObject({ id: discountId, usedCount: 1 });

    const second = await readyCheckout([{ variantId: 'v_tee_m', quantity: 1 }]);
    const result = await updateCheckout(second.token, { discountCode: 'TEN' });
    expect(result.discountMessage).toBe('That code has already been used with this email address.');
    expect(result.checkout.discountCents).toBe(0);
  });

  it('limits a first-order code to customers with no previous order', async () => {
    await seedDiscount({ audience: 'first_order' });
    const first = await readyCheckout([{ variantId: 'v_tee_m', quantity: 1 }]);
    expect((await updateCheckout(first.token, { discountCode: 'TEN' })).checkout.discountCents).toBe(450);
    const { event } = await pay(first.token);
    await handlePaymentEvent(event, 'test');

    const second = await readyCheckout([{ variantId: 'v_tee_m', quantity: 1 }]);
    expect((await updateCheckout(second.token, { discountCode: 'TEN' })).discountMessage).toBe(
      'That code is for a first order only.',
    );
  });
});

describe('expiry and cancellation', () => {
  it('returns stock when the customer cancels', async () => {
    const { token } = await createCheckout({ lines: [{ variantId: 'v_hoodie_m', quantity: 2 }] });
    await cancelCheckout(token);
    expect((await levelOf('v_hoodie_m')).reserved).toBe(0);
    await expect(updateCheckout(token, { email: 'a@example.com' })).rejects.toMatchObject({ code: 'expired' });
  });

  it('releases the stock of expired checkouts', async () => {
    const { checkout } = await createCheckout({ lines: [{ variantId: 'v_hoodie_m', quantity: 2 }] });
    expect(await releaseExpiredReservations(new Date(Date.now() + 10 * 60_000))).toBe(0);
    expect(await releaseExpiredReservations(new Date(checkout.expiresAt.getTime() + 1000))).toBe(1);
    expect((await levelOf('v_hoodie_m')).reserved).toBe(0);
    // And it is idempotent.
    expect(await releaseExpiredReservations(new Date(checkout.expiresAt.getTime() + 1000))).toBe(0);
    await expect(createCheckout({ lines: [{ variantId: 'v_hoodie_m', quantity: 2 }] })).resolves.toBeDefined();
  });

  it('still honours a payment that lands after the hold expired, and flags an oversell', async () => {
    const first = await readyCheckout([{ variantId: 'v_hoodie_m', quantity: 2 }]);
    const { checkout, event } = await pay(first.token);
    // Hold lapses; someone else buys the same two units.
    await releaseExpiredReservations(new Date(checkout.expiresAt.getTime() + 1000));
    const db = await getDb();
    await db.update(schema.checkouts).set({ status: 'open' });
    const second = await readyCheckout([{ variantId: 'v_hoodie_m', quantity: 2 }]);
    const paidSecond = await pay(second.token);
    await handlePaymentEvent(paidSecond.event, 'test');

    const outcome = await handlePaymentEvent(event, 'test');
    expect(outcome.result).toBe('order_created');
    const events = await db.select().from(schema.orderEvents);
    expect(events.some((entry) => entry.type === 'oversold')).toBe(true);
  });
});
