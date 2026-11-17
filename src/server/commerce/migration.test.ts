// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';

import { getDb, schema, useMemoryDatabaseForTesting } from '../db/client';

import { registerCustomer, verifyEmail, signIn } from './customers';
import { importCustomers, importOrders, parseCsv, parseMoney, reconcile } from './migration';
import { refundOrder, listOrdersForCustomer } from './orders';
import { importInventoryCounts, seedCatalog, unverifiedStock } from './seed';
import { levelOf } from './test-helpers';

/**
 * Synthetic rows in the column layout of Shopify's CSV exports. No real
 * customer or order appears here.
 */
const CUSTOMERS = [
  'Customer ID,First Name,Last Name,Email,Accepts Email Marketing,Default Address Address1,Default Address City,Default Address Province Code,Default Address Country Code,Default Address Zip,Phone,Note,Tags',
  "'7001,Ada,Example,ADA@example.com,yes,\"1 Main St, Unit 2\",Winnipeg,MB,CA,R3C 0A1,,VIP,\"troop, early\"",
  "'7002,Bo,Sample,bo@example.com,no,,,,,,,,",
  "'7003,No,Email,,no,,,,,,,,",
].join('\r\n');

const ORDERS = [
  'Name,Email,Financial Status,Fulfillment Status,Currency,Subtotal,Shipping,Taxes,Total,Discount Code,Discount Amount,Created at,Lineitem quantity,Lineitem name,Lineitem price,Lineitem sku,Lineitem fulfillment status,Shipping Name,Shipping Address1,Shipping City,Shipping Zip,Shipping Province,Shipping Country,Refunded Amount,Id,Cancelled at',
  "#1001,ada@example.com,paid,fulfilled,CAD,105.98,12.00,5.90,123.88,,0.00,2026-03-01 10:00:00 -0600,1,Hoodie - M,60.00,,fulfilled,Ada Example,1 Main St,Winnipeg,R3C 0A1,MB,CA,0.00,'9001,",
  '#1001,,,,,,,,,,,,1,Tee - L,45.98,,fulfilled,,,,,,,,,',
  "#1002,guest@example.com,partially_refunded,unfulfilled,CAD,\"1,200.00\",0.00,60.00,\"1,260.00\",TROOP10,0.00,2026-03-02 09:30:00 -0600,20,Bulk Tee,60.00,,pending,Guest Person,2 Side Rd,Toronto,M5V 1A1,ON,CA,100.00,'9002,",
  "#1003,x@example.com,mystery,fulfilled,CAD,1.00,0,0,1.00,,0,2026-03-03 09:30:00 -0600,1,Thing,1.00,,fulfilled,,,,,,,0,'9003,",
].join('\n');

beforeEach(async () => {
  await useMemoryDatabaseForTesting();
});

describe('csv and money parsing', () => {
  it('handles quotes, embedded commas and newlines, CRLF and a BOM', () => {
    const rows = parseCsv('﻿a,b\r\n"x, y","line1\nline2"\r\n"he said ""hi""",2\r\n');
    expect(rows).toEqual([
      { a: 'x, y', b: 'line1\nline2' },
      { a: 'he said "hi"', b: '2' },
    ]);
  });

  it('converts money to integer cents without floating-point drift', () => {
    expect(parseMoney('45.98')).toBe(4598);
    expect(parseMoney('1,260.00')).toBe(126000);
    expect(parseMoney('0.1')).toBe(10);
    expect(parseMoney('19.999')).toBe(1999);
    expect(parseMoney('')).toBe(0);
    expect(parseMoney('-5.50')).toBe(-550);
  });
});

describe('customer import', () => {
  it('imports customers without passwords, with consent and its origin recorded', async () => {
    const report = await importCustomers(CUSTOMERS);
    expect(report).toMatchObject({ rows: 3, created: 2, skippedExisting: 0 });
    expect(report.rejected).toEqual([{ row: 4, reason: expect.stringContaining('No valid email') }]);

    const db = await getDb();
    const all = await db.select().from(schema.customers);
    const ada = all.find((customer) => customer.email === 'ada@example.com')!;
    expect(ada).toMatchObject({
      passwordHash: null,
      emailVerifiedAt: null,
      marketingConsent: true,
      marketingConsentSource: 'shopify-import',
      legacyShopifyId: '7001',
      note: 'VIP',
      tags: ['troop', 'early'],
    });
    expect(all.find((customer) => customer.email === 'bo@example.com')!.marketingConsent).toBe(false);
    const [address] = await db.select().from(schema.customerAddresses);
    expect(address).toMatchObject({ line1: '1 Main St, Unit 2', province: 'MB', country: 'CA', isDefault: true });
  });

  it('is idempotent and a dry run writes nothing', async () => {
    expect((await importCustomers(CUSTOMERS, { dryRun: true })).created).toBe(2);
    const db = await getDb();
    expect(await db.select().from(schema.customers)).toHaveLength(0);

    await importCustomers(CUSTOMERS);
    const again = await importCustomers(CUSTOMERS);
    expect(again).toMatchObject({ created: 0, skippedExisting: 2 });
    expect(await db.select().from(schema.customers)).toHaveLength(2);
  });

  it('lets a migrated customer claim the account only by proving control of the inbox', async () => {
    await importCustomers(CUSTOMERS);
    await expect(signIn('ada@example.com', 'anything-at-all-123')).rejects.toMatchObject({ code: 'credentials' });
    const claim = await registerCustomer({ email: 'ada@example.com', password: 'a-long-enough-password' });
    expect(claim.outcome).toBe('claimed');
    if (claim.outcome !== 'claimed') return;
    await expect(signIn('ada@example.com', 'a-long-enough-password')).rejects.toMatchObject({ code: 'credentials' });
    await verifyEmail(claim.verifyToken);
    await expect(signIn('ada@example.com', 'a-long-enough-password')).resolves.toBeDefined();
  });
});

describe('order import', () => {
  it('groups line-item rows into orders, links customers and keeps totals exact', async () => {
    await importCustomers(CUSTOMERS);
    const report = await importOrders(ORDERS);
    expect(report).toMatchObject({ created: 2, skippedExisting: 0, totalCents: 12388 + 126000 });
    expect(report.rejected).toHaveLength(1);
    expect(report.rejected[0]!.reason).toContain('#1003');

    const db = await getDb();
    const all = await db.select().from(schema.orders);
    const first = all.find((order) => order.name === '#1001')!;
    expect(first).toMatchObject({
      source: 'shopify_import',
      paymentStatus: 'paid',
      fulfillmentStatus: 'fulfilled',
      subtotalCents: 10598,
      shippingCents: 1200,
      taxCents: 590,
      totalCents: 12388,
      legacyShopifyId: '9001',
      paymentRef: null,
    });
    expect(first.placedAt.toISOString()).toBe('2026-03-01T16:00:00.000Z');
    const items = (await db.select().from(schema.orderItems)).filter((item) => item.orderId === first.id);
    expect(items.map((item) => [item.title, item.quantity, item.totalCents, item.fulfilledQuantity])).toEqual([
      ['Hoodie - M', 1, 6000, 1],
      ['Tee - L', 1, 4598, 1],
    ]);

    const second = all.find((order) => order.name === '#1002')!;
    expect(second).toMatchObject({ paymentStatus: 'partially_refunded', refundedCents: 10000, discountCode: 'TROOP10', customerId: null });

    // The imported order shows up in the customer's history.
    const ada = (await db.select().from(schema.customers)).find((customer) => customer.email === 'ada@example.com')!;
    expect((await listOrdersForCustomer(ada.id)).map((order) => order.name)).toEqual(['#1001']);
  });

  it('is idempotent, and a dry run writes nothing', async () => {
    expect((await importOrders(ORDERS, { dryRun: true })).created).toBe(2);
    const db = await getDb();
    expect(await db.select().from(schema.orders)).toHaveLength(0);
    await importOrders(ORDERS);
    expect(await importOrders(ORDERS)).toMatchObject({ created: 0, skippedExisting: 2 });
    expect(await db.select().from(schema.orders)).toHaveLength(2);
  });

  it('cannot be refunded from this platform, and never touches stock', async () => {
    await importOrders(ORDERS);
    const db = await getDb();
    const [order] = await db.select().from(schema.orders);
    await expect(
      refundOrder(order!.id, { amountCents: 100, reason: 'x', actor: 'ops', idempotencyKey: 'k' }),
    ).rejects.toMatchObject({ code: 'conflict' });
    expect(await db.select().from(schema.inventoryMovements)).toHaveLength(0);
  });
});

describe('catalogue and stock migration', () => {
  const product = {
    id: '555',
    slug: 'legacy-tee',
    name: 'Legacy Tee',
    tagline: null,
    description: 'A tee.',
    category: null,
    collectionSlugs: [],
    options: [{ id: 'o', name: 'Size', position: 1, values: ['S', 'M'] }],
    variants: [
      { id: '9001', sku: null, title: 'S', price: { amount: 4500, currency: 'CAD' as const }, compareAtPrice: null, availability: 'in_stock' as const, selectedOptions: { Size: 'S' }, mediaId: null },
      { id: '9002', sku: null, title: 'M', price: { amount: 4500, currency: 'CAD' as const }, compareAtPrice: null, availability: 'sold_out' as const, selectedOptions: { Size: 'M' }, mediaId: null },
    ],
    media: [],
    specification: { materials: null, fit: null, care: null, construction: null, weightGsm: null, countryOfOrigin: null, modelInfo: null },
    tags: [],
    sizeGuideId: null,
    publishedAt: null,
    legacyUrl: null,
    featuredRank: null,
  };

  it('imports once, keeps legacy variant ids, and flags uncounted stock', async () => {
    const report = await seedCatalog([product]);
    expect(report).toMatchObject({ productsCreated: 1, variantsCreated: 2, unverifiedStockVariants: 1, soldOutVariants: 1 });
    expect(await seedCatalog([product])).toMatchObject({ productsCreated: 0, productsSkipped: 1 });

    expect(await levelOf('9001')).toMatchObject({ tracked: false, onHand: 0 });
    expect(await levelOf('9002')).toMatchObject({ tracked: true, onHand: 0 });
    expect(await unverifiedStock()).toEqual([{ product: 'Legacy Tee', variant: 'S' }]);
  });

  it('applies counted stock and reports what it could not match', async () => {
    await seedCatalog([product]);
    const report = await importInventoryCounts([
      { legacyVariantId: '9001', onHand: 12 },
      { legacyVariantId: 'nope', onHand: 3 },
      { legacyVariantId: '9002', onHand: -1 },
    ]);
    expect(report).toEqual({ applied: 1, unmatched: ['nope', '9002'] });
    expect(await levelOf('9001')).toMatchObject({ tracked: true, onHand: 12 });
    expect(await unverifiedStock()).toEqual([]);
  });

  it('reconciles what is in the database', async () => {
    await seedCatalog([product]);
    await importCustomers(CUSTOMERS);
    await importOrders(ORDERS);
    expect(await reconcile()).toEqual({
      products: 1,
      variants: 2,
      variantsWithoutCountedStock: 1,
      customers: 2,
      customersWithoutPassword: 2,
      customersWithMarketingConsent: 1,
      importedOrders: 2,
      importedOrdersTotalCents: 138388,
      importedOrdersWithoutCustomer: 1,
      nativeOrders: 0,
    });
  });
});
