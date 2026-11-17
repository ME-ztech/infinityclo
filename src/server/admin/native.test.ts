// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';

import type { Offer } from '@/domain/offers';

import { loadProducts } from '../commerce/catalog';
import { createCheckout, handlePaymentEvent, startPayment, updateCheckout } from '../commerce/checkout';
import { TestProvider, setPaymentProviderForTesting } from '../commerce/payments';
import { ADDRESS, seedShippingRate } from '../commerce/test-helpers';
import { useMemoryDatabaseForTesting } from '../db/client';

import { GatewayConflictError, GatewayError } from './gateway';
import { NativeGateway, slugify, variantCombinations } from './native';

const gateway = new NativeGateway();
const provider = new TestProvider();

const productInput = {
  title: 'Night Ops Hoodie',
  descriptionHtml: '<p>Heavy fleece.</p><p>Boxy fit.</p>',
  productType: 'Hoodies',
  vendor: 'INFNITY',
  tags: ['drop'],
  status: 'DRAFT' as const,
  seoTitle: '',
  seoDescription: '',
  options: [{ name: 'Size', values: ['S', 'M'] }],
  price: 6000,
  compareAtPrice: null,
  skuPrefix: 'NOH',
};

const offer = (overrides: Partial<Offer> = {}): Offer => ({
  id: 'off_1',
  kind: 'percentage',
  title: 'Ten off',
  status: 'draft',
  method: 'code',
  code: 'ten',
  percentOff: 10,
  minQuantity: null,
  audience: 'everyone',
  eligibility: { scope: 'all', productSlugs: [], categories: [], excludeSaleItems: false },
  startsAt: null,
  endsAt: null,
  usageLimit: null,
  oncePerCustomer: false,
  combinesWith: { productDiscounts: false, orderDiscounts: false, shippingDiscounts: true },
  showOnStorefront: false,
  marginCheckedBy: 'owner@example.com',
  discountId: null,
  sandbox: false,
  internalNote: '',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  createdBy: 'owner@example.com',
  activatedAt: null,
  activatedBy: null,
  ...overrides,
});

beforeEach(async () => {
  await useMemoryDatabaseForTesting();
  provider.refunds.length = 0;
  setPaymentProviderForTesting(provider);
});

/** Creates a product with 5 of size S on the shelf, published. */
async function publishedProduct() {
  const product = await gateway.createProduct(productInput);
  const small = product.variants[0]!;
  await gateway.setInventory({ inventoryItemId: small.id, locationId: 'main', quantity: 5, expectedQuantity: 0, reason: 'received' });
  await gateway.setProductStatus(product.id, 'ACTIVE');
  return { product, small };
}

async function paidOrder(variantId: string, quantity = 1) {
  await seedShippingRate({ id: 'shp_std' });
  const { token } = await createCheckout({ lines: [{ variantId, quantity }] });
  await updateCheckout(token, { email: 'buyer@example.com', shippingAddress: ADDRESS, shippingRateId: 'shp_std' });
  const { checkout } = await startPayment(token);
  const signed = TestProvider.event({ ref: checkout.paymentRef!, amountCents: checkout.totalCents });
  const outcome = await handlePaymentEvent(provider.parseWebhook(signed.rawBody, signed.signature), 'test');
  if (outcome.result !== 'order_created') throw new Error(outcome.result);
  return outcome.orderId;
}

describe('helpers', () => {
  it('builds URL handles from titles', () => {
    expect(slugify("INFNITY'S Night Ops — Hoodie!")).toBe('infnitys-night-ops-hoodie');
    expect(slugify('   ')).toBe('product');
  });

  it('expands option values into every variant combination', () => {
    expect(
      variantCombinations([
        { name: 'Size', values: ['S', 'M'] },
        { name: 'Colour', values: ['Black', 'Bone'] },
      ]),
    ).toHaveLength(4);
    expect(variantCombinations([])).toEqual([{}]);
  });
});

describe('products', () => {
  it('creates a draft with one variant per option value and nothing on the shelf', async () => {
    const product = await gateway.createProduct(productInput);
    expect(product).toMatchObject({ handle: 'night-ops-hoodie', status: 'DRAFT', variantCount: 2, totalInventory: 0 });
    expect(product.descriptionHtml).toBe('Heavy fleece.\n\nBoxy fit.');
    expect(product.variants.map((variant) => [variant.title, variant.sku, variant.price.amount])).toEqual([
      ['S', 'NOH-S', 6000],
      ['M', 'NOH-M', 6000],
    ]);
    // A draft is not on the storefront.
    expect(await loadProducts()).toHaveLength(0);
  });

  it('gives a second product with the same title its own handle', async () => {
    await gateway.createProduct(productInput);
    expect((await gateway.createProduct({ ...productInput, skuPrefix: null })).handle).toBe('night-ops-hoodie-2');
  });

  it('publishes a product onto the storefront with real availability', async () => {
    const { product } = await publishedProduct();
    const [live] = await loadProducts();
    expect(live).toMatchObject({ slug: product.handle, name: 'Night Ops Hoodie' });
    expect(live!.variants.map((variant) => variant.availability)).toEqual(['in_stock', 'sold_out']);
  });

  it('refuses a compare-at price that is not higher than the price', async () => {
    const product = await gateway.createProduct(productInput);
    const variant = product.variants[0]!;
    await expect(
      gateway.updateVariants(product.id, [{ id: variant.id, price: 6000, compareAtPrice: 6000, sku: variant.sku, barcode: null, weightGrams: null }]),
    ).rejects.toBeInstanceOf(GatewayError);
  });

  it('duplicates as a draft with no stock and no SKUs', async () => {
    const { product } = await publishedProduct();
    const copy = await gateway.duplicateProduct(product.id, 'Night Ops Hoodie II');
    expect(copy).toMatchObject({ status: 'DRAFT', handle: 'night-ops-hoodie-ii', totalInventory: 0 });
    expect(copy.variants.every((variant) => variant.sku === null)).toBe(true);
  });
});

describe('inventory', () => {
  it('refuses a stale stock write', async () => {
    const { small } = await publishedProduct();
    await expect(
      gateway.setInventory({ inventoryItemId: small.id, locationId: 'main', quantity: 9, expectedQuantity: 0, reason: 'correction' }),
    ).rejects.toBeInstanceOf(GatewayConflictError);
    const row = (await gateway.listInventory()).find((entry) => entry.variantId === small.id)!;
    expect(row).toMatchObject({ available: 5, onHand: 5, committed: 0, tracked: true });
  });

  it('shows stock promised to a paid order as committed, not available', async () => {
    const { small } = await publishedProduct();
    await paidOrder(small.id, 2);
    const row = (await gateway.listInventory()).find((entry) => entry.variantId === small.id)!;
    expect(row).toMatchObject({ available: 3, committed: 2, onHand: 5 });
  });
});

describe('orders', () => {
  it('lists, fulfils, refunds once and reports the order truthfully', async () => {
    const { small } = await publishedProduct();
    const orderId = await paidOrder(small.id, 2);

    const [summary] = await gateway.listOrders({ payment: 'paid', fulfillment: 'unfulfilled' });
    expect(summary).toMatchObject({ id: orderId, itemCount: 2, test: true });
    expect(summary!.status).toMatchObject({ payment: 'paid', fulfillment: 'unfulfilled', cancelled: false, hasTracking: false });

    await gateway.fulfillOrder(orderId, { trackingNumber: 'CP123', trackingCompany: 'Canada Post', trackingUrl: null, notifyCustomer: false });
    const shipped = (await gateway.getOrder(orderId))!;
    expect(shipped.status).toMatchObject({ fulfillment: 'fulfilled', hasTracking: true });
    expect(shipped.fulfillments[0]).toMatchObject({ status: 'shipped', trackingNumber: 'CP123' });
    expect(shipped.openFulfillmentOrderIds).toEqual([]);

    const refund = { amountCents: 1000, reason: 'Damaged', idempotencyKey: 'key-1', actor: 'ops@example.com' };
    await gateway.refundOrder(orderId, refund);
    await gateway.refundOrder(orderId, refund);
    expect(provider.refunds).toHaveLength(1);
    const refunded = (await gateway.getOrder(orderId))!;
    expect(refunded.refunded.amount).toBe(1000);
    expect(refunded.status.payment).toBe('partially_refunded');

    await expect(gateway.refundOrder(orderId, { ...refund, amountCents: 10_000_000, idempotencyKey: 'key-2' })).rejects.toBeInstanceOf(GatewayError);
    await expect(gateway.cancelOrder(orderId, { reason: 'x', refund: true, actor: 'ops' })).rejects.toBeInstanceOf(GatewayError);
  });

  it('cancels an unshipped order and puts its stock back on sale', async () => {
    const { small } = await publishedProduct();
    const orderId = await paidOrder(small.id, 2);
    await gateway.cancelOrder(orderId, { reason: 'Customer asked', refund: true, actor: 'ops@example.com' });
    const order = (await gateway.getOrder(orderId))!;
    expect(order.status).toMatchObject({ cancelled: true, payment: 'refunded' });
    expect((await gateway.listInventory()).find((entry) => entry.variantId === small.id)!.available).toBe(5);
  });

  it('keeps test orders out of the sales figures', async () => {
    const { small } = await publishedProduct();
    await paidOrder(small.id, 1);
    const metrics = await gateway.overview({ from: '2000-01-01', to: '2999-01-01' });
    expect(metrics).toMatchObject({ ordersCount: 0, testOrdersExcluded: 1 });
    expect(metrics.grossSales.amount).toBe(0);
  });
});

describe('discounts', () => {
  it('makes an offer enforceable, pauses it and frees the code when ended', async () => {
    const { id } = await gateway.createDiscount(offer());
    expect(await gateway.discountUsage(id)).toBe(0);
    await expect(gateway.createDiscount(offer({ id: 'off_2' }))).rejects.toThrow(/already in use/);

    await gateway.setDiscountActive(id, 'code', false);
    await gateway.deleteDiscount(id);
    await expect(gateway.createDiscount(offer({ id: 'off_3' }))).resolves.toBeDefined();
  });

  it('forces once-per-customer on a first-order offer', async () => {
    const { small } = await publishedProduct();
    await gateway.createDiscount(offer({ audience: 'first_order' }));
    await seedShippingRate({ id: 'shp_std' });
    const { token } = await createCheckout({ lines: [{ variantId: small.id, quantity: 1 }] });
    const applied = await updateCheckout(token, { email: 'new@example.com', shippingAddress: ADDRESS, shippingRateId: 'shp_std', discountCode: 'TEN' });
    expect(applied.checkout.discountCents).toBe(600);
  });
});
