// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';

import { getDb, schema, useMemoryDatabaseForTesting } from '../db/client';

import { loadProducts, loadPublicCatalog } from './catalog';
import { createCheckout, handlePaymentEvent, startPayment, updateCheckout } from './checkout';
import {
  changePassword,
  customerForSession,
  deleteAddress,
  eraseCustomer,
  listAddresses,
  registerCustomer,
  requestPasswordReset,
  resetPassword,
  saveAddress,
  signIn,
  signOut,
  updateProfile,
  verifyEmail,
} from './customers';
import { StockConflictError, setOnHand } from './inventory';
import {
  cancelOrder,
  fulfillOrder,
  getOrder,
  getOrderForCustomer,
  listOrders,
  listOrdersForCustomer,
  markDelivered,
  refundOrder,
} from './orders';
import { StripeProvider, TestProvider, setPaymentProviderForTesting, stripeSignature } from './payments';
import { ADDRESS, levelOf, seedProduct, seedShippingRate } from './test-helpers';

const provider = new TestProvider();
const PASSWORD = 'a-long-enough-password';

beforeEach(async () => {
  await useMemoryDatabaseForTesting();
  provider.refunds.length = 0;
  setPaymentProviderForTesting(provider);
  await seedProduct({
    handle: 'hoodie',
    title: 'Blank Hoodie',
    variants: [
      { id: 'v_m', title: 'M', priceCents: 6000, onHand: 5 },
      { id: 'v_l', title: 'L', priceCents: 6000, onHand: 0 },
    ],
  });
  await seedShippingRate({ id: 'shp_std' });
});

async function placeOrder(lines = [{ variantId: 'v_m', quantity: 2 }], email = 'buyer@example.com', customerId?: string) {
  const { token } = await createCheckout({ lines, customerId });
  await updateCheckout(token, { email, shippingAddress: ADDRESS, shippingRateId: 'shp_std' });
  const { checkout } = await startPayment(token);
  const signed = TestProvider.event({ ref: checkout.paymentRef!, amountCents: checkout.totalCents });
  const outcome = await handlePaymentEvent(provider.parseWebhook(signed.rawBody, signed.signature), 'test');
  if (outcome.result !== 'order_created') throw new Error(`expected an order, got ${outcome.result}`);
  return (await getOrder(outcome.orderId))!;
}

async function verifiedCustomer(email = 'buyer@example.com') {
  const result = await registerCustomer({ email, password: PASSWORD, firstName: 'Test' });
  if (result.outcome === 'exists') throw new Error('already registered');
  return verifyEmail(result.verifyToken);
}

describe('catalogue', () => {
  it('shows active products with availability derived from stock', async () => {
    const { products } = await loadPublicCatalog();
    const hoodie = products.find((product) => product.slug === 'hoodie')!;
    expect(hoodie.variants.map((variant) => variant.availability)).toEqual(['in_stock', 'sold_out']);
    expect(hoodie.variants[0]!.price).toEqual({ amount: 6000, currency: 'CAD' });
  });

  it('hides drafts and future launches from the public and shows them to admin', async () => {
    await seedProduct({ handle: 'draft', status: 'draft', variants: [{ id: 'v_d', priceCents: 1, onHand: 1 }] });
    await seedProduct({
      handle: 'soon',
      publishAt: new Date(Date.now() + 3_600_000),
      variants: [{ id: 'v_s', priceCents: 1, onHand: 1 }],
    });
    expect((await loadProducts()).map((product) => product.slug)).toEqual(['hoodie']);
    expect((await loadProducts({ includeUnpublished: true })).map((product) => product.slug).sort()).toEqual([
      'draft',
      'hoodie',
      'soon',
    ]);
  });

  it('turns a variant sold out the moment its last unit is reserved', async () => {
    await createCheckout({ lines: [{ variantId: 'v_m', quantity: 5 }] });
    const [hoodie] = await loadProducts();
    expect(hoodie!.variants[0]!.availability).toBe('sold_out');
  });
});

describe('inventory adjustments', () => {
  it('sets stock with compare-and-set and writes a ledger entry', async () => {
    await setOnHand({ variantId: 'v_m', quantity: 8, expectedQuantity: 5, reason: 'received', actor: 'staff@example.com' });
    expect((await levelOf('v_m')).onHand).toBe(8);
    const db = await getDb();
    const [movement] = await db.select().from(schema.inventoryMovements);
    expect(movement).toMatchObject({ delta: 3, onHandAfter: 8, reason: 'received', actor: 'staff@example.com' });
  });

  it('refuses a stale write instead of overwriting a concurrent change', async () => {
    await setOnHand({ variantId: 'v_m', quantity: 4, expectedQuantity: 5, reason: 'correction', actor: 'a' });
    await expect(
      setOnHand({ variantId: 'v_m', quantity: 9, expectedQuantity: 5, reason: 'correction', actor: 'b' }),
    ).rejects.toBeInstanceOf(StockConflictError);
    expect((await levelOf('v_m')).onHand).toBe(4);
  });
});

describe('fulfilment', () => {
  it('ships an order, takes stock off the shelf and records tracking', async () => {
    const { order, items } = await placeOrder();
    expect(await levelOf('v_m')).toMatchObject({ onHand: 5, reserved: 2 });

    const shipment = await fulfillOrder(order.id, {
      trackingCompany: 'Canada Post',
      trackingNumber: '1234567890',
      trackingUrl: 'https://www.canadapost-postescanada.ca/track?pin=1234567890',
      actor: 'ops@example.com',
    });
    expect(shipment.items).toEqual({ [items[0]!.id]: 2 });
    expect(shipment.deliveredAt).toBeNull();
    expect(await levelOf('v_m')).toMatchObject({ onHand: 3, reserved: 0 });

    const after = (await getOrder(order.id))!;
    expect(after.order.fulfillmentStatus).toBe('fulfilled');
    expect(after.events.map((entry) => entry.type)).toContain('fulfilled');
    await expect(fulfillOrder(order.id, { actor: 'ops@example.com' })).rejects.toMatchObject({ code: 'conflict' });
  });

  it('supports a partial shipment', async () => {
    const { order, items } = await placeOrder();
    await fulfillOrder(order.id, { items: { [items[0]!.id]: 1 }, actor: 'ops' });
    expect((await getOrder(order.id))!.order.fulfillmentStatus).toBe('partially_fulfilled');
    await fulfillOrder(order.id, { actor: 'ops' });
    expect((await getOrder(order.id))!.order.fulfillmentStatus).toBe('fulfilled');
  });

  it('rejects shipping more than was ordered and drops an unsafe tracking link', async () => {
    const { order, items } = await placeOrder();
    await expect(fulfillOrder(order.id, { items: { [items[0]!.id]: 3 }, actor: 'ops' })).rejects.toMatchObject({
      code: 'invalid',
    });
    const shipment = await fulfillOrder(order.id, { trackingUrl: 'javascript:alert(1)', actor: 'ops' });
    expect(shipment.trackingUrl).toBeNull();
  });

  it('records delivery only when someone marks it', async () => {
    const { order } = await placeOrder();
    const shipment = await fulfillOrder(order.id, { actor: 'ops' });
    await markDelivered(shipment.id, 'ops');
    expect((await getOrder(order.id))!.fulfillments[0]!.deliveredAt).toBeInstanceOf(Date);
  });
});

describe('refunds and cancellation', () => {
  it('refunds part of an order through the provider and tracks the balance', async () => {
    const { order } = await placeOrder();
    const updated = await refundOrder(order.id, { amountCents: 2000, reason: 'Damaged', actor: 'ops', idempotencyKey: 'r1' });
    expect(updated).toMatchObject({ paymentStatus: 'partially_refunded', refundedCents: 2000 });
    expect(provider.refunds).toHaveLength(1);
    expect(provider.refunds[0]).toMatchObject({ ref: order.paymentRef, amountCents: 2000 });
  });

  it('does not refund twice when the same request is retried', async () => {
    const { order } = await placeOrder();
    const input = { amountCents: 2000, reason: 'Damaged', actor: 'ops', idempotencyKey: 'r1' };
    await refundOrder(order.id, input);
    await refundOrder(order.id, input);
    expect(provider.refunds).toHaveLength(1);
    expect((await getOrder(order.id))!.order.refundedCents).toBe(2000);
  });

  it('never refunds more than was paid', async () => {
    const { order } = await placeOrder();
    await expect(
      refundOrder(order.id, { amountCents: order.totalCents + 1, reason: '', actor: 'ops', idempotencyKey: 'r1' }),
    ).rejects.toMatchObject({ code: 'invalid' });
    await refundOrder(order.id, { amountCents: order.totalCents, reason: '', actor: 'ops', idempotencyKey: 'r2' });
    expect((await getOrder(order.id))!.order.paymentStatus).toBe('refunded');
    await expect(
      refundOrder(order.id, { amountCents: 1, reason: '', actor: 'ops', idempotencyKey: 'r3' }),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  it('restocks returned items that had shipped', async () => {
    const { order, items } = await placeOrder();
    await fulfillOrder(order.id, { actor: 'ops' });
    await refundOrder(order.id, {
      amountCents: 6000,
      reason: 'Return',
      restock: { [items[0]!.id]: 1 },
      actor: 'ops',
      idempotencyKey: 'ret1',
    });
    expect((await levelOf('v_m')).onHand).toBe(4);
  });

  it('cancels an unshipped order, frees its stock and refunds it', async () => {
    const { order } = await placeOrder();
    const cancelled = await cancelOrder(order.id, { reason: 'Customer request', refund: true, actor: 'ops' });
    expect(cancelled.cancelledAt).toBeInstanceOf(Date);
    expect(cancelled.paymentStatus).toBe('refunded');
    expect(await levelOf('v_m')).toMatchObject({ onHand: 5, reserved: 0 });
    expect(provider.refunds).toHaveLength(1);
    // Cancelling again changes nothing and refunds nothing.
    await cancelOrder(order.id, { reason: 'again', refund: true, actor: 'ops' });
    expect(provider.refunds).toHaveLength(1);
  });

  it('refuses to cancel an order that has shipped', async () => {
    const { order } = await placeOrder();
    await fulfillOrder(order.id, { actor: 'ops' });
    await expect(cancelOrder(order.id, { reason: 'x', refund: true, actor: 'ops' })).rejects.toMatchObject({
      code: 'conflict',
    });
  });

  it('finds orders by number, email and status', async () => {
    const { order } = await placeOrder();
    expect((await listOrders({ search: order.name })).map((row) => row.id)).toEqual([order.id]);
    expect(await listOrders({ search: 'buyer@example' })).toHaveLength(1);
    expect(await listOrders({ payment: 'refunded' })).toHaveLength(0);
    expect(await listOrders({ fulfillment: 'unfulfilled' })).toHaveLength(1);
  });
});

describe('customer accounts', () => {
  it('registers, requires verification, then signs in', async () => {
    const result = await registerCustomer({ email: ' Buyer@Example.com ', password: PASSWORD, firstName: 'Test' });
    expect(result.outcome).toBe('created');
    if (result.outcome === 'exists') return;
    expect(result.customer.email).toBe('buyer@example.com');
    expect(result.customer.passwordHash).not.toContain(PASSWORD);
    expect(result.customer.marketingConsent).toBe(false);

    await expect(signIn('buyer@example.com', PASSWORD)).rejects.toMatchObject({ code: 'credentials' });
    await verifyEmail(result.verifyToken);
    const { sessionToken, customer } = await signIn('BUYER@example.com', PASSWORD);
    expect((await customerForSession(sessionToken))!.id).toBe(customer.id);
  });

  it('uses a verification link only once', async () => {
    const result = await registerCustomer({ email: 'a@example.com', password: PASSWORD });
    if (result.outcome === 'exists') return;
    await verifyEmail(result.verifyToken);
    await expect(verifyEmail(result.verifyToken)).rejects.toMatchObject({ code: 'token' });
    await expect(verifyEmail('made-up')).rejects.toMatchObject({ code: 'token' });
  });

  it('rejects weak passwords and bad emails', async () => {
    await expect(registerCustomer({ email: 'a@example.com', password: 'short' })).rejects.toMatchObject({ code: 'invalid' });
    await expect(registerCustomer({ email: 'nope', password: PASSWORD })).rejects.toMatchObject({ code: 'invalid' });
  });

  it('does not create a second account or change the password for an existing address', async () => {
    await verifiedCustomer();
    const again = await registerCustomer({ email: 'buyer@example.com', password: 'another-long-password' });
    expect(again.outcome).toBe('exists');
    await expect(signIn('buyer@example.com', 'another-long-password')).rejects.toMatchObject({ code: 'credentials' });
    await expect(signIn('buyer@example.com', PASSWORD)).resolves.toBeDefined();
  });

  it('gives the same error for a wrong password and an unknown account', async () => {
    await verifiedCustomer();
    const wrong = await signIn('buyer@example.com', 'wrong-password-here').catch((error: Error) => error.message);
    const unknown = await signIn('nobody@example.com', PASSWORD).catch((error: Error) => error.message);
    expect(wrong).toBe(unknown);
  });

  it('signs out by revoking the session', async () => {
    await verifiedCustomer();
    const { sessionToken } = await signIn('buyer@example.com', PASSWORD);
    await signOut(sessionToken);
    expect(await customerForSession(sessionToken)).toBeNull();
    expect(await customerForSession('forged')).toBeNull();
  });

  it('resets a password once, and signs every device out', async () => {
    await verifiedCustomer();
    const { sessionToken } = await signIn('buyer@example.com', PASSWORD);
    expect(await requestPasswordReset('nobody@example.com')).toBeNull();
    const reset = (await requestPasswordReset('buyer@example.com'))!;
    await resetPassword(reset.token, 'a-brand-new-password');
    expect(await customerForSession(sessionToken)).toBeNull();
    await expect(signIn('buyer@example.com', PASSWORD)).rejects.toMatchObject({ code: 'credentials' });
    await expect(signIn('buyer@example.com', 'a-brand-new-password')).resolves.toBeDefined();
    await expect(resetPassword(reset.token, 'yet-another-password')).rejects.toMatchObject({ code: 'token' });
  });

  it('changes a password only with the current one, keeping this session', async () => {
    const customer = await verifiedCustomer();
    const first = await signIn('buyer@example.com', PASSWORD);
    const second = await signIn('buyer@example.com', PASSWORD);
    await expect(changePassword(customer.id, 'wrong', 'a-brand-new-password')).rejects.toMatchObject({ code: 'credentials' });
    await changePassword(customer.id, PASSWORD, 'a-brand-new-password', first.sessionToken);
    expect(await customerForSession(first.sessionToken)).not.toBeNull();
    expect(await customerForSession(second.sessionToken)).toBeNull();
  });

  it('lets a migrated customer with no password claim the account by verifying', async () => {
    const db = await getDb();
    await db.insert(schema.customers).values({ id: 'cus_legacy', email: 'old@example.com', firstName: 'Old', legacyShopifyId: '42' });
    const result = await registerCustomer({ email: 'old@example.com', password: PASSWORD });
    expect(result.outcome).toBe('claimed');
    if (result.outcome !== 'claimed') return;
    expect(result.customer.id).toBe('cus_legacy');
    await verifyEmail(result.verifyToken);
    await expect(signIn('old@example.com', PASSWORD)).resolves.toBeDefined();
  });

  it('records marketing consent only when given, with when and where', async () => {
    const customer = await verifiedCustomer();
    const opted = await updateProfile(customer.id, { marketingConsent: true });
    expect(opted).toMatchObject({ marketingConsent: true, marketingConsentSource: 'account' });
    expect(opted.marketingConsentAt).toBeInstanceOf(Date);
    const withdrawn = await updateProfile(customer.id, { marketingConsent: false, firstName: 'New' });
    expect(withdrawn).toMatchObject({ marketingConsent: false, marketingConsentSource: 'account-withdrawn', firstName: 'New' });
  });

  it('saves addresses and keeps exactly one default', async () => {
    const customer = await verifiedCustomer();
    const first = await saveAddress(customer.id, ADDRESS);
    expect(first.address!.isDefault).toBe(true);
    const second = await saveAddress(customer.id, { ...ADDRESS, line1: '2 Other Road', isDefault: true });
    const addresses = await listAddresses(customer.id);
    expect(addresses.filter((address) => address.isDefault).map((address) => address.id)).toEqual([second.address!.id]);
    expect((await saveAddress(customer.id, { country: 'CA' })).problems.length).toBeGreaterThan(0);
  });
});

describe('customer isolation', () => {
  it('never returns one customer’s order, address or history to another', async () => {
    const alice = await verifiedCustomer('alice@example.com');
    const bob = await verifiedCustomer('bob@example.com');
    const { order } = await placeOrder([{ variantId: 'v_m', quantity: 1 }], 'alice@example.com', alice.id);
    const address = (await saveAddress(alice.id, ADDRESS)).address!;

    expect((await getOrderForCustomer(alice.id, order.id))!.order.id).toBe(order.id);
    expect(await getOrderForCustomer(bob.id, order.id)).toBeNull();
    expect(await listOrdersForCustomer(bob.id)).toHaveLength(0);
    expect(await listAddresses(bob.id)).toHaveLength(0);

    expect((await saveAddress(bob.id, { ...ADDRESS, line1: 'Hijacked' }, address.id)).address).toBeNull();
    expect(await deleteAddress(bob.id, address.id)).toBe(false);
    expect((await listAddresses(alice.id))[0]!.line1).toBe(ADDRESS.line1);
  });

  it('attaches earlier guest orders only after the address is verified', async () => {
    const { order } = await placeOrder([{ variantId: 'v_m', quantity: 1 }], 'guest@example.com');
    const result = await registerCustomer({ email: 'guest@example.com', password: PASSWORD });
    if (result.outcome === 'exists') return;
    expect(await listOrdersForCustomer(result.customer.id)).toHaveLength(0);
    await verifyEmail(result.verifyToken);
    expect((await listOrdersForCustomer(result.customer.id)).map((row) => row.id)).toEqual([order.id]);
  });

  it('erases a customer while keeping an anonymised order record', async () => {
    const alice = await verifiedCustomer('alice@example.com');
    const { order } = await placeOrder([{ variantId: 'v_m', quantity: 1 }], 'alice@example.com', alice.id);
    await eraseCustomer(alice.id);
    const kept = (await getOrder(order.id))!.order;
    expect(kept.customerId).toBeNull();
    expect(kept.email).not.toContain('alice');
    expect(kept.shippingAddress).toBeNull();
    await expect(signIn('alice@example.com', PASSWORD)).rejects.toMatchObject({ code: 'credentials' });
  });
});

describe('Stripe webhook verification', () => {
  const secret = 'whsec_test_secret';
  const stripe = new StripeProvider('sk_test_x', 'pk_test_x', secret);
  const body = JSON.stringify({
    id: 'evt_1',
    type: 'payment_intent.succeeded',
    livemode: false,
    data: { object: { id: 'pi_1', amount_received: 7500, currency: 'cad' } },
  });
  const now = () => Math.floor(Date.now() / 1000);

  it('accepts a correctly signed event and classifies it', () => {
    expect(stripe.parseWebhook(body, stripeSignature(secret, body, now()))).toEqual({
      kind: 'payment_succeeded',
      eventId: 'evt_1',
      ref: 'pi_1',
      amountCents: 7500,
      currency: 'CAD',
      test: true,
    });
  });

  it('rejects a wrong secret, a modified body, a stale timestamp and a missing header', () => {
    expect(() => stripe.parseWebhook(body, stripeSignature('whsec_other', body, now()))).toThrow('signature');
    expect(() => stripe.parseWebhook(body.replace('7500', '1'), stripeSignature(secret, body, now()))).toThrow('signature');
    expect(() => stripe.parseWebhook(body, stripeSignature(secret, body, now() - 3600))).toThrow('signature');
    expect(() => stripe.parseWebhook(body, null)).toThrow('signature');
  });

  it('refuses everything when no webhook secret is configured', () => {
    const unconfigured = new StripeProvider('sk_test_x', 'pk_test_x', null);
    expect(() => unconfigured.parseWebhook(body, stripeSignature(secret, body, now()))).toThrow('signature');
  });
});
