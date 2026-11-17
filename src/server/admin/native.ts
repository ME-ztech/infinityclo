/**
 * Native gateway — the back office over INFNITY's own database.
 *
 * This is the production implementation of `CommerceGateway`. Every method is
 * a thin adapter onto the commerce engine (`src/server/commerce/*`), so the
 * rules that protect stock and money are the same ones checkout uses and are
 * not re-implemented here.
 */
import 'server-only';

import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql } from 'drizzle-orm';

import type { Offer } from '@/domain/offers';
import { htmlToText } from '@/domain/text';

import { StockConflictError, setOnHand } from '../commerce/inventory';
import { cancelOrder, fulfillOrder, getOrder, itemCounts, listOrders, refundOrder, updateOrderNote } from '../commerce/orders';
import { paymentMode } from '../commerce/payments';
import { getDb, schema } from '../db/client';
import { newId } from '../db/ids';

import {
  GatewayConflictError,
  GatewayError,
  GatewayNotFoundError,
  cents,
  type AdminCustomer,
  type AdminCustomerSummary,
  type AdminOrder,
  type AdminOrderSummary,
  type AdminProduct,
  type AdminProductSummary,
  type AdminVariant,
  type CommerceGateway,
  type FulfillInput,
  type InventoryRow,
  type InventorySetInput,
  type OrderQuery,
  type OrderStatus,
  type OverviewMetrics,
  type ProductCreateInput,
  type ProductInput,
  type ProductStatus,
  type VariantUpdate,
} from './gateway';

const { products, productOptions, productVariants, productMedia, inventoryLevels, orders, orderItems, customers, discounts } =
  schema;

const LOCATION = { id: 'main', name: 'Main stock' } as const;

type ProductRow = typeof products.$inferSelect;
type OrderRow = typeof orders.$inferSelect;

const toStatus = (status: ProductRow['status']): ProductStatus => status.toUpperCase() as ProductStatus;
const fromStatus = (status: ProductStatus): ProductRow['status'] => status.toLowerCase() as ProductRow['status'];

export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'product'
  );
}

/** Every combination of the option values, in option order. */
export function variantCombinations(
  options: ReadonlyArray<{ name: string; values: readonly string[] }>,
): Array<Record<string, string>> {
  return options
    .filter((option) => option.values.length > 0)
    .reduce<Array<Record<string, string>>>(
      (combos, option) => combos.flatMap((combo) => option.values.map((value) => ({ ...combo, [option.name]: value }))),
      [{}],
    );
}

function orderStatus(order: OrderRow, hasTracking: boolean): OrderStatus {
  return {
    payment: order.paymentStatus,
    fulfillment: order.fulfillmentStatus,
    cancelled: order.cancelledAt !== null,
    hasTracking,
  };
}

const addressLines = (address: OrderRow['shippingAddress']): string[] =>
  address
    ? [
        `${address.firstName} ${address.lastName}`.trim(),
        address.line1,
        address.line2,
        [address.city, address.province, address.postalCode].filter(Boolean).join(' '),
        address.country,
        address.phone ?? '',
      ].filter(Boolean)
    : [];

export class NativeGateway implements CommerceGateway {
  readonly mode = 'native' as const;
  readonly sourceLabel = 'INFNITY database';

  /* ---------------------------------------------------------------- *
   * Products
   * ---------------------------------------------------------------- */

  private async summaries(rows: ProductRow[]): Promise<AdminProductSummary[]> {
    if (rows.length === 0) return [];
    const db = await getDb();
    const ids = rows.map((row) => row.id);
    const [variants, media, levels] = await Promise.all([
      db.select().from(productVariants).where(inArray(productVariants.productId, ids)),
      db.select().from(productMedia).where(inArray(productMedia.productId, ids)).orderBy(asc(productMedia.position)),
      db
        .select({ level: inventoryLevels, productId: productVariants.productId })
        .from(inventoryLevels)
        .innerJoin(productVariants, eq(productVariants.id, inventoryLevels.variantId))
        .where(inArray(productVariants.productId, ids)),
    ]);
    return rows.map((row) => {
      const own = variants.filter((variant) => variant.productId === row.id);
      const prices = own.map((variant) => variant.priceCents);
      const stock = levels.filter((entry) => entry.productId === row.id);
      const image = media.find((item) => item.productId === row.id);
      return {
        id: row.id,
        handle: row.handle,
        title: row.title,
        status: toStatus(row.status),
        totalInventory: stock.some((entry) => entry.level.tracked)
          ? stock.filter((entry) => entry.level.tracked).reduce((total, entry) => total + entry.level.onHand - entry.level.reserved, 0)
          : null,
        priceMin: prices.length ? cents(Math.min(...prices)) : null,
        priceMax: prices.length ? cents(Math.max(...prices)) : null,
        image: image ? { url: image.url, alt: image.alt } : null,
        variantCount: own.length,
        updatedAt: row.updatedAt.toISOString(),
      };
    });
  }

  async listProducts(query: { search?: string; status?: ProductStatus | '' } = {}): Promise<AdminProductSummary[]> {
    const db = await getDb();
    const term = query.search?.trim();
    const rows = await db
      .select()
      .from(products)
      .where(
        and(
          term ? or(ilike(products.title, `%${term}%`), ilike(products.handle, `%${term}%`)) : undefined,
          query.status ? eq(products.status, fromStatus(query.status)) : undefined,
        ),
      )
      .orderBy(desc(products.updatedAt));
    return this.summaries(rows);
  }

  async getProduct(id: string): Promise<AdminProduct | null> {
    const db = await getDb();
    const [row] = await db.select().from(products).where(eq(products.id, id));
    if (!row) return null;
    const [summary] = await this.summaries([row]);
    const [options, variants, media, levels] = await Promise.all([
      db.select().from(productOptions).where(eq(productOptions.productId, id)).orderBy(asc(productOptions.position)),
      db.select().from(productVariants).where(eq(productVariants.productId, id)).orderBy(asc(productVariants.position)),
      db.select().from(productMedia).where(eq(productMedia.productId, id)).orderBy(asc(productMedia.position)),
      db
        .select({ level: inventoryLevels })
        .from(inventoryLevels)
        .innerJoin(productVariants, eq(productVariants.id, inventoryLevels.variantId))
        .where(eq(productVariants.productId, id)),
    ]);
    const levelByVariant = new Map(levels.map((entry) => [entry.level.variantId, entry.level]));
    return {
      ...summary!,
      // Descriptions are stored as plain text; the editor field is the same text.
      descriptionHtml: row.description,
      productType: row.productType,
      vendor: row.vendor,
      tags: row.tags,
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
      options: options.map((option) => ({ name: option.name, values: option.values })),
      variants: variants.map((variant): AdminVariant => {
        const level = levelByVariant.get(variant.id);
        return {
          id: variant.id,
          title: variant.title,
          options: Object.entries(variant.optionValues).map(([name, value]) => ({ name, value })),
          price: cents(variant.priceCents, variant.currency),
          compareAtPrice: variant.compareAtCents !== null ? cents(variant.compareAtCents, variant.currency) : null,
          sku: variant.sku,
          barcode: variant.barcode,
          weightGrams: variant.weightGrams,
          inventoryItemId: variant.id,
          inventoryQuantity: level?.tracked ? level.onHand - level.reserved : null,
        };
      }),
      media: media.map((item) => ({ id: item.id, url: item.url, alt: item.alt })),
    };
  }

  private async uniqueHandle(title: string): Promise<string> {
    const db = await getDb();
    const base = slugify(title);
    const taken = new Set(
      (await db.select({ handle: products.handle }).from(products).where(ilike(products.handle, `${base}%`))).map(
        (row) => row.handle,
      ),
    );
    if (!taken.has(base)) return base;
    for (let suffix = 2; ; suffix += 1) {
      if (!taken.has(`${base}-${suffix}`)) return `${base}-${suffix}`;
    }
  }

  async createProduct(input: ProductCreateInput): Promise<AdminProduct> {
    if (!input.title.trim()) throw new GatewayError('Give the product a title.');
    if (!Number.isInteger(input.price) || input.price < 0) throw new GatewayError('Enter a price of zero or more.');
    const options = input.options
      .map((option) => ({ name: option.name.trim(), values: [...new Set(option.values.map((value) => value.trim()).filter(Boolean))] }))
      .filter((option) => option.name && option.values.length > 0)
      .slice(0, 3);
    const combos = variantCombinations(options);
    if (combos.length > 100) throw new GatewayError('That is more than 100 variants. Reduce the option values.');

    const db = await getDb();
    const id = newId('prd');
    const handle = await this.uniqueHandle(input.title);
    await db.transaction(async (tx) => {
      await tx.insert(products).values({
        id,
        handle,
        title: input.title.trim(),
        description: htmlToText(input.descriptionHtml) ?? '',
        productType: input.productType.trim(),
        vendor: input.vendor.trim(),
        tags: [...input.tags],
        status: fromStatus(input.status),
        seoTitle: input.seoTitle.trim(),
        seoDescription: input.seoDescription.trim(),
      });
      for (const [index, option] of options.entries()) {
        await tx.insert(productOptions).values({ id: newId('opt'), productId: id, name: option.name, position: index + 1, values: option.values });
      }
      for (const [index, combo] of combos.entries()) {
        const variantId = newId('var');
        const title = Object.values(combo).join(' / ') || input.title.trim();
        await tx.insert(productVariants).values({
          id: variantId,
          productId: id,
          title,
          sku: input.skuPrefix ? `${input.skuPrefix}-${slugify(title).toUpperCase()}`.slice(0, 60) : null,
          priceCents: input.price,
          compareAtCents: input.compareAtPrice,
          optionValues: combo,
          position: index + 1,
        });
        // A new variant starts with nothing on the shelf: it cannot be sold
        // until someone counts stock in.
        await tx.insert(inventoryLevels).values({ variantId, onHand: 0, tracked: true });
      }
    });
    return (await this.getProduct(id))!;
  }

  async updateProduct(id: string, input: ProductInput): Promise<AdminProduct> {
    if (!input.title.trim()) throw new GatewayError('Give the product a title.');
    const db = await getDb();
    const updated = await db
      .update(products)
      .set({
        title: input.title.trim(),
        description: htmlToText(input.descriptionHtml) ?? '',
        productType: input.productType.trim(),
        vendor: input.vendor.trim(),
        tags: [...input.tags],
        status: fromStatus(input.status),
        seoTitle: input.seoTitle.trim(),
        seoDescription: input.seoDescription.trim(),
        updatedAt: new Date(),
      })
      .where(eq(products.id, id))
      .returning({ id: products.id });
    if (updated.length === 0) throw new GatewayNotFoundError('Product');
    return (await this.getProduct(id))!;
  }

  async updateVariants(productId: string, variants: readonly VariantUpdate[]): Promise<void> {
    const db = await getDb();
    await db.transaction(async (tx) => {
      for (const variant of variants) {
        if (!Number.isInteger(variant.price) || variant.price < 0) throw new GatewayError('Prices must be zero or more.');
        if (variant.compareAtPrice !== null && variant.compareAtPrice <= variant.price) {
          throw new GatewayError('A compare-at price must be higher than the price, or left empty.');
        }
        try {
          await tx
            .update(productVariants)
            .set({
              priceCents: variant.price,
              compareAtCents: variant.compareAtPrice,
              sku: variant.sku?.trim() || null,
              barcode: variant.barcode?.trim() || null,
              weightGrams: variant.weightGrams,
              updatedAt: new Date(),
            })
            .where(and(eq(productVariants.id, variant.id), eq(productVariants.productId, productId)));
        } catch (error) {
          if (/product_variants_sku_key|unique/i.test((error as Error).message)) {
            throw new GatewayError(`SKU "${variant.sku}" is already used by another variant.`);
          }
          throw error;
        }
      }
      await tx.update(products).set({ updatedAt: new Date() }).where(eq(products.id, productId));
    });
  }

  async duplicateProduct(id: string, newTitle: string): Promise<AdminProduct> {
    const source = await this.getProduct(id);
    if (!source) throw new GatewayNotFoundError('Product');
    const db = await getDb();
    const copyId = newId('prd');
    const handle = await this.uniqueHandle(newTitle);
    const [row] = await db.select().from(products).where(eq(products.id, id));
    await db.transaction(async (tx) => {
      await tx.insert(products).values({
        ...row!,
        id: copyId,
        handle,
        title: newTitle.trim(),
        // A copy is always a draft and never inherits a legacy identity.
        status: 'draft',
        publishAt: null,
        legacyShopifyId: null,
        featuredRank: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      for (const [index, option] of source.options.entries()) {
        await tx.insert(productOptions).values({ id: newId('opt'), productId: copyId, name: option.name, position: index + 1, values: [...option.values] });
      }
      const media = await tx.select().from(productMedia).where(eq(productMedia.productId, id));
      for (const item of media) await tx.insert(productMedia).values({ ...item, id: newId('med'), productId: copyId, createdAt: new Date() });
      for (const [index, variant] of source.variants.entries()) {
        const variantId = newId('var');
        await tx.insert(productVariants).values({
          id: variantId,
          productId: copyId,
          title: variant.title,
          sku: null,
          barcode: null,
          priceCents: variant.price.amount,
          compareAtCents: variant.compareAtPrice?.amount ?? null,
          optionValues: Object.fromEntries(variant.options.map((option) => [option.name, option.value])),
          weightGrams: variant.weightGrams,
          position: index + 1,
        });
        await tx.insert(inventoryLevels).values({ variantId, onHand: 0, tracked: true });
      }
    });
    return (await this.getProduct(copyId))!;
  }

  async setProductStatus(id: string, status: ProductStatus): Promise<void> {
    const db = await getDb();
    const updated = await db
      .update(products)
      .set({ status: fromStatus(status), updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning({ id: products.id });
    if (updated.length === 0) throw new GatewayNotFoundError('Product');
  }

  async addProductImage(id: string, url: string, alt: string): Promise<void> {
    if (!/^\/(?!\/)[\w./-]+\.(?:jpe?g|png|webp|avif)$/i.test(url) && !/^https:\/\/[^\s"'<>]+$/i.test(url)) {
      throw new GatewayError('Enter an image path on this site or an https:// image URL.');
    }
    const db = await getDb();
    const existing = await db.select().from(productMedia).where(eq(productMedia.productId, id));
    await db.insert(productMedia).values({
      id: newId('med'),
      productId: id,
      url,
      alt: alt.trim().slice(0, 200),
      width: 1600,
      height: 1600,
      position: existing.length + 1,
      kind: existing.length === 0 ? 'product' : 'detail',
    });
    await db.update(products).set({ updatedAt: new Date() }).where(eq(products.id, id));
  }

  /* ---------------------------------------------------------------- *
   * Inventory
   * ---------------------------------------------------------------- */

  async listInventory(): Promise<InventoryRow[]> {
    const db = await getDb();
    const rows = await db
      .select({ level: inventoryLevels, variant: productVariants, product: products })
      .from(inventoryLevels)
      .innerJoin(productVariants, eq(productVariants.id, inventoryLevels.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .orderBy(asc(products.title), asc(productVariants.position));
    return rows.map((row) => ({
      productId: row.product.id,
      productTitle: row.product.title,
      variantId: row.variant.id,
      variantTitle: row.variant.title,
      sku: row.variant.sku,
      inventoryItemId: row.variant.id,
      tracked: row.level.tracked,
      locationId: LOCATION.id,
      locationName: LOCATION.name,
      available: Math.max(0, row.level.onHand - row.level.reserved),
      committed: row.level.reserved,
      unavailable: 0,
      onHand: row.level.onHand,
    }));
  }

  /**
   * The operator edits what they see — the *available* figure. It is converted
   * to an on-hand count using the reservation level read in the same call, and
   * written with compare-and-set so a sale in between raises a conflict.
   */
  async setInventory(input: InventorySetInput): Promise<void> {
    const db = await getDb();
    const [level] = await db.select().from(inventoryLevels).where(eq(inventoryLevels.variantId, input.inventoryItemId));
    if (!level) throw new GatewayNotFoundError('Variant');
    if (Math.max(0, level.onHand - level.reserved) !== input.expectedQuantity) {
      throw new GatewayConflictError();
    }
    try {
      await setOnHand({
        variantId: input.inventoryItemId,
        quantity: input.quantity + level.reserved,
        expectedQuantity: level.onHand,
        reason: input.reason,
        actor: 'admin',
      });
      // Counting stock in means the variant is now limited by that count.
      if (!level.tracked) await db.update(inventoryLevels).set({ tracked: true }).where(eq(inventoryLevels.variantId, level.variantId));
    } catch (error) {
      if (error instanceof StockConflictError) throw new GatewayConflictError();
      throw new GatewayError((error as Error).message);
    }
  }

  /* ---------------------------------------------------------------- *
   * Orders
   * ---------------------------------------------------------------- */

  private async orderSummaries(rows: OrderRow[]): Promise<AdminOrderSummary[]> {
    if (rows.length === 0) return [];
    const db = await getDb();
    const ids = rows.map((row) => row.id);
    const [counts, tracked, people] = await Promise.all([
      itemCounts(ids),
      db
        .select({ orderId: schema.fulfillments.orderId })
        .from(schema.fulfillments)
        .where(and(inArray(schema.fulfillments.orderId, ids), sql`${schema.fulfillments.trackingNumber} IS NOT NULL`)),
      db
        .select()
        .from(customers)
        .where(
          inArray(
            customers.id,
            rows.map((row) => row.customerId).filter((value): value is string => Boolean(value)),
          ),
        ),
    ]);
    const withTracking = new Set(tracked.map((row) => row.orderId));
    return rows.map((row) => {
      const customer = people.find((person) => person.id === row.customerId);
      const fromAddress = row.shippingAddress ? `${row.shippingAddress.firstName} ${row.shippingAddress.lastName}`.trim() : '';
      return {
        id: row.id,
        name: row.name,
        createdAt: row.placedAt.toISOString(),
        customerName: (customer ? `${customer.firstName} ${customer.lastName}`.trim() : fromAddress) || null,
        email: row.email || null,
        total: cents(row.totalCents, row.currency),
        status: orderStatus(row, withTracking.has(row.id)),
        itemCount: counts.get(row.id) ?? 0,
        test: row.test,
      };
    });
  }

  async listOrders(query: OrderQuery = {}): Promise<AdminOrderSummary[]> {
    const payment = { paid: 'paid', pending: 'pending_payment', refunded: 'refunded', partially_refunded: 'partially_refunded' } as const;
    const fulfillment = { unfulfilled: 'unfulfilled', partial: 'partially_fulfilled', fulfilled: 'fulfilled' } as const;
    const rows = await listOrders({
      search: query.search,
      payment: query.payment ? payment[query.payment] : undefined,
      fulfillment: query.fulfillment ? fulfillment[query.fulfillment] : undefined,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      limit: query.limit,
    });
    return this.orderSummaries(rows);
  }

  async getOrder(id: string): Promise<AdminOrder | null> {
    const found = await getOrder(id);
    if (!found) return null;
    const [summary] = await this.orderSummaries([found.order]);
    const { order } = found;
    return {
      ...summary!,
      lines: found.items.map((item) => ({
        title: item.title,
        variantTitle: item.variantTitle || null,
        sku: item.sku,
        quantity: item.quantity,
        unitPrice: cents(item.unitPriceCents, order.currency),
        total: cents(item.totalCents, order.currency),
        discount: cents(item.discountCents, order.currency),
      })),
      subtotal: cents(order.subtotalCents, order.currency),
      discounts: cents(order.discountCents, order.currency),
      discountCodes: order.discountCode ? [order.discountCode] : [],
      shipping: cents(order.shippingCents, order.currency),
      tax: cents(order.taxCents, order.currency),
      refunded: cents(order.refundedCents, order.currency),
      note: order.note,
      cancelledAt: order.cancelledAt?.toISOString() ?? null,
      cancelReason: order.cancelReason,
      shippingAddress: addressLines(order.shippingAddress),
      fulfillments: found.fulfillments.map((shipment) => ({
        id: shipment.id,
        status: shipment.deliveredAt ? 'delivered' : 'shipped',
        createdAt: shipment.shippedAt.toISOString(),
        trackingNumber: shipment.trackingNumber,
        trackingCompany: shipment.trackingCompany,
        trackingUrl: shipment.trackingUrl,
      })),
      openFulfillmentOrderIds:
        !order.cancelledAt && order.fulfillmentStatus !== 'fulfilled' && order.paymentStatus !== 'pending_payment' ? [order.id] : [],
      customerId: order.customerId,
    };
  }

  async updateOrderNote(id: string, note: string): Promise<void> {
    await updateOrderNote(id, note, 'admin');
  }

  async fulfillOrder(id: string, input: FulfillInput): Promise<void> {
    try {
      await fulfillOrder(id, {
        trackingCompany: input.trackingCompany,
        trackingNumber: input.trackingNumber,
        trackingUrl: input.trackingUrl,
        actor: 'admin',
      });
    } catch (error) {
      throw new GatewayError((error as Error).message);
    }
  }

  async refundOrder(id: string, input: { amountCents: number; reason: string; idempotencyKey: string; actor: string }): Promise<void> {
    try {
      await refundOrder(id, input);
    } catch (error) {
      throw new GatewayError((error as Error).message);
    }
  }

  async cancelOrder(id: string, input: { reason: string; refund: boolean; actor: string }): Promise<void> {
    try {
      await cancelOrder(id, input);
    } catch (error) {
      throw new GatewayError((error as Error).message);
    }
  }

  /* ---------------------------------------------------------------- *
   * Customers
   * ---------------------------------------------------------------- */

  private async customerSummaries(rows: Array<typeof customers.$inferSelect>): Promise<AdminCustomerSummary[]> {
    if (rows.length === 0) return [];
    const db = await getDb();
    const stats = await db
      .select({
        customerId: orders.customerId,
        count: sql<number>`count(*)::int`,
        spent: sql<number>`coalesce(sum(${orders.totalCents} - ${orders.refundedCents}), 0)::int`,
        last: sql<Date | null>`max(${orders.placedAt})`,
      })
      .from(orders)
      .where(
        and(
          inArray(
            orders.customerId,
            rows.map((row) => row.id),
          ),
          sql`${orders.cancelledAt} IS NULL`,
        ),
      )
      .groupBy(orders.customerId);
    return rows.map((row) => {
      const own = stats.find((entry) => entry.customerId === row.id);
      return {
        id: row.id,
        name: `${row.firstName} ${row.lastName}`.trim() || row.email,
        email: row.email,
        ordersCount: own?.count ?? 0,
        totalSpent: cents(own?.spent ?? 0),
        lastOrderAt: own?.last ? new Date(own.last).toISOString() : null,
        marketingState: row.marketingConsent ? 'subscribed' : 'not subscribed',
        tags: row.tags,
        createdAt: row.createdAt.toISOString(),
      };
    });
  }

  async listCustomers(query: { search?: string } = {}): Promise<AdminCustomerSummary[]> {
    const db = await getDb();
    const term = query.search?.trim();
    const byOrder = term
      ? (await db.select({ customerId: orders.customerId }).from(orders).where(ilike(orders.name, `%${term}%`)))
          .map((row) => row.customerId)
          .filter((value): value is string => Boolean(value))
      : [];
    const rows = await db
      .select()
      .from(customers)
      .where(
        term
          ? or(
              ilike(customers.email, `%${term}%`),
              ilike(customers.firstName, `%${term}%`),
              ilike(customers.lastName, `%${term}%`),
              byOrder.length ? inArray(customers.id, byOrder) : undefined,
            )
          : undefined,
      )
      .orderBy(desc(customers.createdAt))
      .limit(200);
    return this.customerSummaries(rows);
  }

  async getCustomer(id: string): Promise<AdminCustomer | null> {
    const db = await getDb();
    const [row] = await db.select().from(customers).where(eq(customers.id, id));
    if (!row) return null;
    const [summary] = await this.customerSummaries([row]);
    const [address] = await db
      .select()
      .from(schema.customerAddresses)
      .where(eq(schema.customerAddresses.customerId, id))
      .orderBy(desc(schema.customerAddresses.isDefault))
      .limit(1);
    const history = await db.select().from(orders).where(eq(orders.customerId, id)).orderBy(desc(orders.placedAt)).limit(50);
    return {
      ...summary!,
      phone: row.phone,
      note: row.note,
      location: address ? [address.city, address.province, address.country].filter(Boolean).join(', ') : null,
      orders: await this.orderSummaries(history),
    };
  }

  async updateCustomer(id: string, input: { note: string; tags: readonly string[] }): Promise<void> {
    const db = await getDb();
    const updated = await db
      .update(customers)
      .set({ note: input.note.slice(0, 5000), tags: input.tags.map((tag) => tag.trim()).filter(Boolean).slice(0, 30), updatedAt: new Date() })
      .where(eq(customers.id, id))
      .returning({ id: customers.id });
    if (updated.length === 0) throw new GatewayNotFoundError('Customer');
  }

  /* ---------------------------------------------------------------- *
   * Discounts
   * ---------------------------------------------------------------- */

  /**
   * Makes an offer enforceable at checkout by copying its definition into the
   * `discounts` table. `productIds` is ignored: eligibility is stored as the
   * offer expresses it (product handles and category groups).
   */
  async createDiscount(offer: Offer): Promise<{ id: string }> {
    const db = await getDb();
    const id = newId('dsc');
    try {
      await db.insert(discounts).values({
        id,
        offerId: offer.id,
        title: offer.title,
        kind: offer.kind,
        method: offer.method,
        code: offer.method === 'code' ? (offer.code ?? '').toUpperCase() : null,
        percentOff: offer.percentOff,
        minQuantity: offer.kind === 'bundle' ? (offer.minQuantity ?? 2) : null,
        audience: offer.audience,
        eligibility: {
          scope: offer.eligibility.scope,
          productSlugs: [...offer.eligibility.productSlugs],
          categories: [...offer.eligibility.categories],
          excludeSaleItems: offer.eligibility.excludeSaleItems,
        },
        startsAt: offer.startsAt ? new Date(offer.startsAt) : null,
        endsAt: offer.endsAt ? new Date(offer.endsAt) : null,
        usageLimit: offer.usageLimit,
        oncePerCustomer: offer.oncePerCustomer || offer.audience === 'first_order',
      });
    } catch (error) {
      if (/discounts_code_key|unique/i.test((error as Error).message)) {
        throw new GatewayError(`The code "${offer.code}" is already in use by another discount.`);
      }
      throw error;
    }
    return { id };
  }

  async setDiscountActive(id: string, _method: Offer['method'], active: boolean): Promise<void> {
    const db = await getDb();
    await db.update(discounts).set({ status: active ? 'active' : 'paused', updatedAt: new Date() }).where(eq(discounts.id, id));
  }

  /** Ends the discount and frees its code. The row is kept: orders reference it. */
  async deleteDiscount(id: string): Promise<void> {
    const db = await getDb();
    await db.update(discounts).set({ status: 'ended', code: null, updatedAt: new Date() }).where(eq(discounts.id, id));
  }

  async discountUsage(id: string): Promise<number | null> {
    const db = await getDb();
    const [row] = await db.select({ used: discounts.usedCount }).from(discounts).where(eq(discounts.id, id));
    return row?.used ?? null;
  }

  /* ---------------------------------------------------------------- *
   * Overview
   * ---------------------------------------------------------------- */

  async overview(range: { from: string; to: string }): Promise<OverviewMetrics> {
    const db = await getDb();
    const from = new Date(range.from);
    const to = new Date(range.to);
    const inRange = and(gte(orders.placedAt, from), lte(orders.placedAt, to));
    const all = await db.select().from(orders).where(inRange);
    const real = all.filter((order) => !order.test);
    const counted = real.filter((order) => !order.cancelledAt);
    const gross = counted.reduce((total, order) => total + order.totalCents, 0);
    const refunded = counted.reduce((total, order) => total + order.refundedCents, 0);

    const lines = counted.length
      ? await db
          .select()
          .from(orderItems)
          .where(
            inArray(
              orderItems.orderId,
              counted.map((order) => order.id),
            ),
          )
      : [];
    const bySku = new Map<string, { quantity: number; revenue: number }>();
    for (const line of lines) {
      const label = `${line.title}${line.variantTitle ? ` — ${line.variantTitle}` : ''}`;
      const entry = bySku.get(label) ?? { quantity: 0, revenue: 0 };
      entry.quantity += line.quantity;
      entry.revenue += line.totalCents;
      bySku.set(label, entry);
    }
    const codes = new Map<string, number>();
    for (const order of counted) if (order.discountCode) codes.set(order.discountCode, (codes.get(order.discountCode) ?? 0) + 1);

    const [newCustomers] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(customers)
      .where(and(gte(customers.createdAt, from), lte(customers.createdAt, to)));
    const [awaiting] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(orders)
      .where(
        and(
          sql`${orders.cancelledAt} IS NULL`,
          inArray(orders.paymentStatus, ['paid', 'partially_refunded']),
          inArray(orders.fulfillmentStatus, ['unfulfilled', 'partially_fulfilled']),
          eq(orders.test, false),
        ),
      );

    return {
      from: range.from,
      to: range.to,
      currency: 'CAD',
      ordersCount: counted.length,
      paidOrders: counted.filter((order) => order.paymentStatus !== 'pending_payment').length,
      grossSales: cents(gross),
      netSales: cents(gross - refunded),
      averageOrderValue: counted.length ? cents(Math.round(gross / counted.length)) : null,
      awaitingFulfillment: awaiting?.count ?? 0,
      newCustomers: newCustomers?.count ?? 0,
      topSkus: [...bySku.entries()]
        .map(([label, entry]) => ({ label, quantity: entry.quantity, revenue: cents(entry.revenue) }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 10),
      discountCodes: [...codes.entries()].map(([code, count]) => ({ code, orders: count })).sort((a, b) => b.orders - a.orders),
      truncated: false,
      testOrdersExcluded: all.length - real.length,
      source: `INFNITY database (payments: ${paymentMode()})`,
    };
  }

  externalUrl(): string | null {
    return null;
  }
}
