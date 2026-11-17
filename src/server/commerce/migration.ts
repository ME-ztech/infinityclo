/**
 * Shopify → INFNITY migration: customers and historical orders.
 *
 * Input is Shopify's own CSV exports (Admin → Customers → Export, and
 * Admin → Orders → Export). Nothing here calls Shopify; the owner exports the
 * files and runs the import, so no API token is needed and the legacy store is
 * never written to.
 *
 * Properties every importer here has:
 *
 *   Idempotent    keyed on the legacy id (or order name), so re-running after a
 *                 fresh export adds what is new and changes nothing else.
 *   Dry-runnable  `dryRun: true` validates and reports without writing.
 *   Accountable   returns counts and a list of every row it could not import,
 *                 with the reason, for the reconciliation report.
 *
 * What does not migrate, by design:
 *
 *   Passwords              Shopify never exports them. Customers arrive with no
 *                          password and set one by registering or using "forgot
 *                          password" — both prove control of the inbox first.
 *   Saved cards / tokens   Belong to Shopify Payments and cannot be moved.
 *   Payment records        Historical orders are imported as records
 *                          (`source = shopify_import`). They hold no payment
 *                          reference here, so they cannot be refunded from this
 *                          platform; refunds on them are made in Shopify while
 *                          it remains open.
 *   Stock effects          Imported orders never touch inventory.
 */
import 'server-only';

import { eq } from 'drizzle-orm';

import { getDb, schema } from '../db/client';
import { newId } from '../db/ids';
import type { AddressSnapshot } from '../db/schema';
import { normaliseEmail } from '../security';

const { customers, customerAddresses, orders, orderItems, orderEvents } = schema;

/* ------------------------------------------------------------------ *
 * CSV
 * ------------------------------------------------------------------ */

/** RFC-4180 parser: quoted fields, escaped quotes, embedded newlines, CRLF, BOM. */
export function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const source = text.replace(/^﻿/, '');
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!;
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((cells) => cells.some((cell) => cell.trim() !== ''));
  if (!header) return [];
  const keys = header.map((cell) => cell.trim());
  return body.map((cells) => Object.fromEntries(keys.map((key, index) => [key, (cells[index] ?? '').trim()])));
}

/** "1,234.50" or "45.98" → integer cents, without floating-point drift. */
export function parseMoney(value: string | undefined): number {
  const clean = (value ?? '').replace(/[^0-9.-]/g, '');
  if (!clean) return 0;
  const negative = clean.startsWith('-');
  const [whole = '0', fraction = ''] = clean.replace('-', '').split('.');
  const cents = Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
  return negative ? -cents : cents;
}

const date = (value: string | undefined): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const yes = (value: string | undefined): boolean => /^(yes|true|1|subscribed)$/i.test(value ?? '');
// Shopify prefixes ids with an apostrophe so spreadsheets keep them as text.
const id = (value: string | undefined): string => (value ?? '').replace(/^'/, '').trim();

export interface ImportReport {
  readonly dryRun: boolean;
  readonly rows: number;
  readonly created: number;
  readonly skippedExisting: number;
  readonly rejected: ReadonlyArray<{ row: number; reason: string }>;
  /** Sum of order totals imported, in cents. Compare with Shopify's own total. */
  readonly totalCents?: number;
}

/* ------------------------------------------------------------------ *
 * Customers
 * ------------------------------------------------------------------ */

export async function importCustomers(csv: string, options: { dryRun?: boolean } = {}): Promise<ImportReport> {
  const dryRun = options.dryRun ?? false;
  const rows = parseCsv(csv);
  const db = await getDb();
  const existing = await db.select({ email: customers.email, legacy: customers.legacyShopifyId }).from(customers);
  const emails = new Set(existing.map((row) => row.email));
  const legacyIds = new Set(existing.map((row) => row.legacy).filter(Boolean));

  let created = 0;
  let skippedExisting = 0;
  const rejected: Array<{ row: number; reason: string }> = [];

  for (const [index, row] of rows.entries()) {
    const line = index + 2;
    const email = normaliseEmail(row['Email']);
    const legacyId = id(row['Customer ID']) || null;
    if (!email) {
      rejected.push({ row: line, reason: 'No valid email address (customers without one cannot sign in).' });
      continue;
    }
    if (emails.has(email) || (legacyId && legacyIds.has(legacyId))) {
      skippedExisting += 1;
      continue;
    }
    emails.add(email);
    if (legacyId) legacyIds.add(legacyId);
    created += 1;
    if (dryRun) continue;

    const consent = yes(row['Accepts Email Marketing']);
    const customerId = newId('cus');
    await db.transaction(async (tx) => {
      await tx.insert(customers).values({
        id: customerId,
        email,
        passwordHash: null,
        firstName: row['First Name'] ?? '',
        lastName: row['Last Name'] ?? '',
        phone: row['Phone'] || row['Default Address Phone'] || null,
        // The address was verified by Shopify; the customer still proves control
        // of the inbox when they set a password here.
        emailVerifiedAt: null,
        // Consent given to the brand on the legacy store carries over, with its
        // origin recorded.
        marketingConsent: consent,
        marketingConsentAt: consent ? new Date() : null,
        marketingConsentSource: consent ? 'shopify-import' : null,
        note: row['Note'] ?? '',
        tags: (row['Tags'] ?? '').split(',').map((tag) => tag.trim()).filter(Boolean),
        legacyShopifyId: legacyId,
      });
      const line1 = row['Default Address Address1'];
      const country = (row['Default Address Country Code'] ?? '').toUpperCase();
      if (line1 && /^[A-Z]{2}$/.test(country)) {
        await tx.insert(customerAddresses).values({
          id: newId('adr'),
          customerId,
          firstName: row['First Name'] ?? '',
          lastName: row['Last Name'] ?? '',
          line1,
          line2: row['Default Address Address2'] ?? '',
          city: row['Default Address City'] ?? '',
          province: (row['Default Address Province Code'] ?? '').toUpperCase(),
          postalCode: (row['Default Address Zip'] ?? '').replace(/^'/, ''),
          country,
          phone: row['Default Address Phone'] || null,
          isDefault: true,
        });
      }
    });
  }

  return { dryRun, rows: rows.length, created, skippedExisting, rejected };
}

/* ------------------------------------------------------------------ *
 * Orders
 * ------------------------------------------------------------------ */

type PaymentStatus = (typeof schema.orderPaymentStatus.enumValues)[number];
type FulfillmentStatus = (typeof schema.orderFulfillmentStatus.enumValues)[number];

const PAYMENT: Record<string, PaymentStatus> = {
  paid: 'paid',
  partially_refunded: 'partially_refunded',
  refunded: 'refunded',
  pending: 'pending_payment',
  authorized: 'pending_payment',
  partially_paid: 'pending_payment',
  voided: 'pending_payment',
};

const FULFILLMENT: Record<string, FulfillmentStatus> = {
  fulfilled: 'fulfilled',
  partial: 'partially_fulfilled',
  unfulfilled: 'unfulfilled',
  '': 'unfulfilled',
  restocked: 'unfulfilled',
};

/**
 * Imports Shopify's order export. That file has one row per line item; only
 * the first row of each order carries the order-level columns.
 */
export async function importOrders(csv: string, options: { dryRun?: boolean } = {}): Promise<ImportReport> {
  const dryRun = options.dryRun ?? false;
  const rows = parseCsv(csv);
  const db = await getDb();

  const grouped = new Map<string, Array<{ line: number; row: Record<string, string> }>>();
  const rejected: Array<{ row: number; reason: string }> = [];
  for (const [index, row] of rows.entries()) {
    const name = row['Name'];
    if (!name) {
      rejected.push({ row: index + 2, reason: 'Row has no order name.' });
      continue;
    }
    const group = grouped.get(name) ?? [];
    group.push({ line: index + 2, row });
    grouped.set(name, group);
  }

  const existing = new Set(
    (await db.select({ name: orders.name, legacy: orders.legacyShopifyId }).from(orders).where(eq(orders.source, 'shopify_import'))).flatMap(
      (row) => [row.name, row.legacy ?? ''],
    ),
  );
  const customerByEmail = new Map(
    (await db.select({ id: customers.id, email: customers.email }).from(customers)).map((row) => [row.email, row.id]),
  );

  let created = 0;
  let skippedExisting = 0;
  let totalCents = 0;

  for (const [name, group] of grouped) {
    const head = group[0]!.row;
    const legacyId = id(head['Id']) || null;
    if (existing.has(name) || (legacyId && existing.has(legacyId))) {
      skippedExisting += 1;
      continue;
    }
    const paymentStatus = PAYMENT[(head['Financial Status'] ?? '').toLowerCase()];
    const fulfillmentStatus = FULFILLMENT[(head['Fulfillment Status'] ?? '').toLowerCase()];
    const placedAt = date(head['Created at']);
    if (!paymentStatus || !fulfillmentStatus || !placedAt) {
      rejected.push({
        row: group[0]!.line,
        reason: `Order ${name}: unrecognised status or date ("${head['Financial Status']}", "${head['Fulfillment Status']}", "${head['Created at']}").`,
      });
      continue;
    }

    const lines = group
      .map(({ row }) => ({
        title: row['Lineitem name'] ?? '',
        sku: row['Lineitem sku'] || null,
        quantity: Number(row['Lineitem quantity'] ?? 0),
        unitPriceCents: parseMoney(row['Lineitem price']),
        discountCents: parseMoney(row['Lineitem discount']),
        fulfilled: (row['Lineitem fulfillment status'] ?? '').toLowerCase() === 'fulfilled',
      }))
      .filter((line) => line.title && Number.isInteger(line.quantity) && line.quantity > 0);
    if (lines.length === 0) {
      rejected.push({ row: group[0]!.line, reason: `Order ${name}: no line items.` });
      continue;
    }

    const total = parseMoney(head['Total']);
    // Shopify can report a refund larger than the total when shipping was
    // refunded separately; the schema caps refunded at total.
    const refunded = Math.min(total, Math.max(0, parseMoney(head['Refunded Amount'])));
    const email = normaliseEmail(head['Email']);
    const country = (head['Shipping Country'] ?? '').toUpperCase();
    const address: AddressSnapshot | null = head['Shipping Address1']
      ? {
          firstName: (head['Shipping Name'] ?? '').split(' ')[0] ?? '',
          lastName: (head['Shipping Name'] ?? '').split(' ').slice(1).join(' '),
          line1: head['Shipping Address1'],
          line2: head['Shipping Address2'] ?? '',
          city: head['Shipping City'] ?? '',
          province: (head['Shipping Province'] ?? '').toUpperCase(),
          postalCode: (head['Shipping Zip'] ?? '').replace(/^'/, ''),
          country,
          phone: head['Shipping Phone'] || null,
        }
      : null;

    created += 1;
    totalCents += total;
    if (dryRun) continue;

    await db.transaction(async (tx) => {
      const orderId = newId('ord');
      await tx.insert(orders).values({
        id: orderId,
        name,
        source: 'shopify_import',
        customerId: email ? (customerByEmail.get(email) ?? null) : null,
        email: email ?? '',
        paymentStatus,
        fulfillmentStatus,
        cancelledAt: date(head['Cancelled at']),
        currency: head['Currency'] || 'CAD',
        subtotalCents: parseMoney(head['Subtotal']),
        discountCents: parseMoney(head['Discount Amount']),
        shippingCents: parseMoney(head['Shipping']),
        taxCents: parseMoney(head['Taxes']),
        totalCents: total,
        refundedCents: refunded,
        discountCode: head['Discount Code'] || null,
        shippingAddress: address,
        shippingName: head['Shipping Method'] || null,
        note: head['Notes'] ?? '',
        legacyShopifyId: legacyId,
        placedAt,
      });
      await tx.insert(orderItems).values(
        lines.map((line) => ({
          id: newId('oli'),
          orderId,
          title: line.title,
          sku: line.sku,
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
          discountCents: line.discountCents,
          totalCents: line.unitPriceCents * line.quantity - line.discountCents,
          fulfilledQuantity: line.fulfilled ? line.quantity : 0,
        })),
      );
      await tx.insert(orderEvents).values({
        id: newId('evt'),
        orderId,
        type: 'imported',
        message: 'Imported from the legacy Shopify store as a historical record.',
        actor: 'migration',
        createdAt: placedAt,
      });
    });
  }

  return { dryRun, rows: rows.length, created, skippedExisting, rejected, totalCents };
}

/* ------------------------------------------------------------------ *
 * Reconciliation
 * ------------------------------------------------------------------ */

export interface Reconciliation {
  readonly products: number;
  readonly variants: number;
  readonly variantsWithoutCountedStock: number;
  readonly customers: number;
  readonly customersWithoutPassword: number;
  readonly customersWithMarketingConsent: number;
  readonly importedOrders: number;
  readonly importedOrdersTotalCents: number;
  readonly importedOrdersWithoutCustomer: number;
  readonly nativeOrders: number;
}

/**
 * The figures to hold against Shopify's own (Products count, Customers count,
 * Orders count and Total sales for the same date range) before cutover. Any
 * difference must be explained by the importers' `rejected` lists.
 */
export async function reconcile(): Promise<Reconciliation> {
  const db = await getDb();
  const [productRows, variantRows, levels, customerRows, orderRows] = await Promise.all([
    db.select({ id: schema.products.id }).from(schema.products),
    db.select({ id: schema.productVariants.id }).from(schema.productVariants),
    db.select().from(schema.inventoryLevels),
    db.select().from(customers),
    db.select().from(orders),
  ]);
  const imported = orderRows.filter((order) => order.source === 'shopify_import');
  return {
    products: productRows.length,
    variants: variantRows.length,
    variantsWithoutCountedStock: levels.filter((level) => !level.tracked).length,
    customers: customerRows.length,
    customersWithoutPassword: customerRows.filter((customer) => !customer.passwordHash).length,
    customersWithMarketingConsent: customerRows.filter((customer) => customer.marketingConsent).length,
    importedOrders: imported.length,
    importedOrdersTotalCents: imported.reduce((total, order) => total + order.totalCents, 0),
    importedOrdersWithoutCustomer: imported.filter((order) => !order.customerId).length,
    nativeOrders: orderRows.length - imported.length,
  };
}
