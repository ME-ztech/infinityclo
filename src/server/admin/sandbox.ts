/**
 * Sandbox gateway.
 *
 * A local stand-in for the store, so the back office can be learned and tested
 * without a database and without touching real data. The dashboard labels
 * it SANDBOX on every screen.
 *
 * What it contains, and what it deliberately does not:
 *
 *   Products   seeded once from the imported catalogue (real names and prices).
 *   Inventory  SYNTHETIC. 25 per variant that was in stock at import, 0 for
 *              sold-out ones. These are placeholders, not the store's counts.
 *   Orders     none, until an operator creates one with "Create test order".
 *              Every such order is flagged TEST.
 *   Customers  none. Customer records are personal data and are never invented.
 *
 * Nothing here is visible to shoppers and nothing here reaches the live database.
 */
import 'server-only';

import { products as snapshotProducts } from '@/data/adapters/local/snapshot';
import type { Offer } from '@/domain/offers';
import type { Product } from '@/domain/types';

import { getStore, newId } from '../store';

import {
  GatewayConflictError,
  GatewayError,
  GatewayNotFoundError,
  cents,
  mapOrderStatus,
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
  type OverviewMetrics,
  type ProductCreateInput,
  type ProductInput,
  type ProductStatus,
  type VariantUpdate,
} from './gateway';
import { computeOverview } from './metrics';

const LOCATION = { id: 'sandbox-location', name: 'Sandbox location' } as const;
export const SANDBOX_SEED_STOCK = 25;

interface SandboxDiscount {
  readonly id: string;
  readonly offerId: string;
  readonly active: boolean;
  readonly createdAt: string;
}

interface SandboxOrder extends AdminOrder {
  readonly financial: string;
  readonly fulfillmentStatus: string;
}

const productKey = (id: string) => `product:${id}`;
const orderKey = (id: string) => `order:${id}`;
const discountKey = (id: string) => `discount:${id}`;

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'product'
  );
}

function summarise(product: AdminProduct): AdminProductSummary {
  const prices = product.variants.map((variant) => variant.price.amount);
  const tracked = product.variants.filter((variant) => variant.inventoryQuantity !== null);
  return {
    id: product.id,
    handle: product.handle,
    title: product.title,
    status: product.status,
    totalInventory: tracked.length ? tracked.reduce((total, variant) => total + (variant.inventoryQuantity ?? 0), 0) : null,
    priceMin: prices.length ? cents(Math.min(...prices)) : null,
    priceMax: prices.length ? cents(Math.max(...prices)) : null,
    image: product.media[0] ? { url: product.media[0].url, alt: product.media[0].alt } : null,
    variantCount: product.variants.length,
    updatedAt: product.updatedAt,
  };
}

function fromCatalogue(product: Product): AdminProduct {
  const variants: AdminVariant[] = product.variants.map((variant) => ({
    id: `sbx-variant-${variant.id}`,
    title: variant.title,
    options: Object.entries(variant.selectedOptions).map(([name, value]) => ({ name, value })),
    price: variant.price,
    compareAtPrice: variant.compareAtPrice,
    sku: variant.sku,
    barcode: null,
    weightGrams: null,
    inventoryItemId: `sbx-item-${variant.id}`,
    inventoryQuantity: variant.availability === 'sold_out' || variant.availability === 'archived' ? 0 : SANDBOX_SEED_STOCK,
  }));
  const base = {
    id: `sbx-${product.id}`,
    handle: product.slug,
    title: product.name,
    status: 'ACTIVE' as ProductStatus,
    descriptionHtml: (product.description ?? '')
      .split('\n\n')
      .filter(Boolean)
      .map((paragraph) => `<p>${paragraph.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`)
      .join(''),
    productType: product.category ?? '',
    vendor: 'INFNITY',
    tags: [...product.tags],
    seoTitle: '',
    seoDescription: '',
    options: product.options.map((option) => ({ name: option.name, values: [...option.values] })),
    variants,
    media: product.media.map((media) => ({ id: media.id, url: media.url, alt: media.alt })),
    updatedAt: product.publishedAt ?? new Date(0).toISOString(),
  };
  return { ...base, ...summarise(base as unknown as AdminProduct) };
}

function cartesian(options: ProductCreateInput['options']): Array<Array<{ name: string; value: string }>> {
  return options.reduce<Array<Array<{ name: string; value: string }>>>(
    (combinations, option) =>
      combinations.flatMap((combination) => option.values.map((value) => [...combination, { name: option.name, value }])),
    [[]],
  );
}

export class SandboxAdminGateway implements CommerceGateway {
  readonly mode = 'sandbox' as const;
  readonly sourceLabel = 'Sandbox (local data — not the real store)';

  private async seed(): Promise<void> {
    const store = getStore();
    const claimed = await store.putIfAbsent('sandbox', 'seeded', { at: new Date().toISOString(), products: snapshotProducts.length });
    if (!claimed) return;
    for (const product of snapshotProducts) {
      const record = fromCatalogue(product);
      await store.put('sandbox', productKey(record.id), record);
    }
  }

  private async all<T>(kind: 'product' | 'order' | 'discount'): Promise<T[]> {
    await this.seed();
    const documents = await getStore().list<Record<string, unknown>>('sandbox');
    // The store lists values without keys, so each kind is recognised by shape.
    const is = {
      product: (document: Record<string, unknown>) => 'variants' in document,
      order: (document: Record<string, unknown>) => 'lines' in document,
      discount: (document: Record<string, unknown>) => 'offerId' in document,
    }[kind];
    return documents.filter(is) as T[];
  }

  private async saveProduct(product: AdminProduct): Promise<AdminProduct> {
    const next = { ...product, updatedAt: new Date().toISOString() };
    const record = { ...next, ...summarise(next) };
    await getStore().put('sandbox', productKey(record.id), record);
    return record;
  }

  /* -------------------------- products -------------------------- */

  async listProducts(query: { search?: string; status?: ProductStatus | '' } = {}): Promise<AdminProductSummary[]> {
    const needle = query.search?.trim().toLowerCase() ?? '';
    const products = await this.all<AdminProduct>('product');
    return products
      .filter((product) => !query.status || product.status === query.status)
      .filter((product) => !needle || product.title.toLowerCase().includes(needle) || product.handle.includes(needle) || product.variants.some((variant) => variant.sku?.toLowerCase().includes(needle)))
      .map(summarise)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.title.localeCompare(b.title));
  }

  async getProduct(id: string): Promise<AdminProduct | null> {
    await this.seed();
    return getStore().get<AdminProduct>('sandbox', productKey(id));
  }

  private async mustGetProduct(id: string): Promise<AdminProduct> {
    const product = await this.getProduct(id);
    if (!product) throw new GatewayNotFoundError('Product');
    return product;
  }

  async createProduct(input: ProductCreateInput): Promise<AdminProduct> {
    await this.seed();
    const existing = await this.all<AdminProduct>('product');
    const base = slugify(input.title);
    let handle = base;
    for (let suffix = 2; existing.some((product) => product.handle === handle); suffix += 1) handle = `${base}-${suffix}`;

    const id = newId('sbx');
    const combinations = input.options.length ? cartesian(input.options) : [[]];
    if (combinations.length > 100) throw new GatewayError('A product can have at most 100 variants.');
    const variants: AdminVariant[] = combinations.map((options, index) => ({
      id: `${id}-v${index + 1}`,
      title: options.length ? options.map((option) => option.value).join(' / ') : 'Default',
      options,
      price: cents(input.price),
      compareAtPrice: input.compareAtPrice && input.compareAtPrice > input.price ? cents(input.compareAtPrice) : null,
      sku: input.skuPrefix ? `${input.skuPrefix}-${options.map((option) => option.value.toUpperCase().replace(/[^A-Z0-9]+/g, '')).join('-') || index + 1}` : null,
      barcode: null,
      weightGrams: null,
      inventoryItemId: `${id}-i${index + 1}`,
      inventoryQuantity: 0,
    }));

    const draft = {
      id,
      handle,
      title: input.title,
      status: input.status,
      descriptionHtml: input.descriptionHtml,
      productType: input.productType,
      vendor: input.vendor,
      tags: [...input.tags],
      seoTitle: input.seoTitle,
      seoDescription: input.seoDescription,
      options: input.options.map((option) => ({ name: option.name, values: [...option.values] })),
      variants,
      media: [],
      updatedAt: new Date().toISOString(),
    } as unknown as AdminProduct;
    return this.saveProduct(draft);
  }

  async updateProduct(id: string, input: ProductInput): Promise<AdminProduct> {
    const product = await this.mustGetProduct(id);
    return this.saveProduct({ ...product, ...input, tags: [...input.tags] });
  }

  async updateVariants(productId: string, updates: readonly VariantUpdate[]): Promise<void> {
    const product = await this.mustGetProduct(productId);
    const byId = new Map(updates.map((update) => [update.id, update]));
    await this.saveProduct({
      ...product,
      variants: product.variants.map((variant) => {
        const update = byId.get(variant.id);
        if (!update) return variant;
        return {
          ...variant,
          price: cents(update.price, variant.price.currency),
          compareAtPrice: update.compareAtPrice && update.compareAtPrice > update.price ? cents(update.compareAtPrice, variant.price.currency) : null,
          sku: update.sku,
          barcode: update.barcode,
          weightGrams: update.weightGrams,
        };
      }),
    });
  }

  async duplicateProduct(id: string, newTitle: string): Promise<AdminProduct> {
    const product = await this.mustGetProduct(id);
    const copy = await this.createProduct({
      title: newTitle,
      descriptionHtml: product.descriptionHtml,
      productType: product.productType,
      vendor: product.vendor,
      tags: product.tags,
      status: 'DRAFT',
      seoTitle: product.seoTitle,
      seoDescription: product.seoDescription,
      options: product.options,
      price: product.variants[0]?.price.amount ?? 0,
      compareAtPrice: null,
      skuPrefix: null,
    });
    // Carry over per-variant pricing and the imagery; stock starts at zero.
    const priced = copy.variants.map((variant, index) => {
      const source = product.variants[index];
      return source ? { ...variant, price: source.price, compareAtPrice: source.compareAtPrice } : variant;
    });
    return this.saveProduct({ ...copy, variants: priced, media: product.media.map((media) => ({ ...media })) });
  }

  async setProductStatus(id: string, status: ProductStatus): Promise<void> {
    const product = await this.mustGetProduct(id);
    await this.saveProduct({ ...product, status });
  }

  async addProductImage(id: string, url: string, alt: string): Promise<void> {
    const product = await this.mustGetProduct(id);
    await this.saveProduct({ ...product, media: [...product.media, { id: newId('img'), url, alt }] });
  }

  /* -------------------------- inventory -------------------------- */

  async listInventory(): Promise<InventoryRow[]> {
    const products = await this.all<AdminProduct>('product');
    return products
      .filter((product) => product.status !== 'ARCHIVED')
      .sort((a, b) => a.title.localeCompare(b.title))
      .flatMap((product) =>
        product.variants
          .filter((variant) => variant.inventoryItemId)
          .map((variant) => ({
            productId: product.id,
            productTitle: product.title,
            variantId: variant.id,
            variantTitle: variant.title,
            sku: variant.sku,
            inventoryItemId: variant.inventoryItemId!,
            tracked: true,
            locationId: LOCATION.id,
            locationName: LOCATION.name,
            available: variant.inventoryQuantity ?? 0,
            committed: null,
            unavailable: null,
            onHand: variant.inventoryQuantity ?? 0,
          })),
      );
  }

  async setInventory(input: InventorySetInput): Promise<void> {
    if (!Number.isInteger(input.quantity) || input.quantity < 0) throw new GatewayError('Quantity must be zero or more.');
    const products = await this.all<AdminProduct>('product');
    const product = products.find((entry) => entry.variants.some((variant) => variant.inventoryItemId === input.inventoryItemId));
    if (!product || input.locationId !== LOCATION.id) throw new GatewayNotFoundError('Inventory item');
    // Re-read immediately before writing: the comparison is against stored
    // state, not against the list this request started with.
    const fresh = await this.mustGetProduct(product.id);
    const current = fresh.variants.find((variant) => variant.inventoryItemId === input.inventoryItemId)?.inventoryQuantity ?? 0;
    if (current !== input.expectedQuantity) throw new GatewayConflictError();
    await this.saveProduct({
      ...fresh,
      variants: fresh.variants.map((variant) =>
        variant.inventoryItemId === input.inventoryItemId ? { ...variant, inventoryQuantity: input.quantity } : variant,
      ),
    });
  }

  /* -------------------------- orders -------------------------- */

  private view(order: SandboxOrder): AdminOrder {
    return {
      ...order,
      status: mapOrderStatus({
        displayFinancialStatus: order.financial,
        displayFulfillmentStatus: order.fulfillmentStatus,
        cancelledAt: order.cancelledAt,
        trackingNumbers: order.fulfillments.map((fulfillment) => fulfillment.trackingNumber),
      }),
    };
  }

  async listOrders(query: OrderQuery = {}): Promise<AdminOrderSummary[]> {
    const needle = query.search?.trim().toLowerCase() ?? '';
    const orders = (await this.all<SandboxOrder>('order')).map((order) => this.view(order));
    return orders
      .filter((order) => !needle || order.name.toLowerCase().includes(needle) || (order.email ?? '').toLowerCase().includes(needle))
      .filter((order) => !query.from || order.createdAt.slice(0, 10) >= query.from)
      .filter((order) => !query.to || order.createdAt.slice(0, 10) <= query.to)
      .filter((order) => {
        if (query.payment === 'paid') return order.status.payment === 'paid';
        if (query.payment === 'pending') return order.status.payment === 'pending_payment';
        if (query.payment === 'refunded') return order.status.payment === 'refunded';
        if (query.payment === 'partially_refunded') return order.status.payment === 'partially_refunded';
        return true;
      })
      .filter((order) => {
        if (query.fulfillment === 'unfulfilled') return order.status.fulfillment === 'unfulfilled';
        if (query.fulfillment === 'partial') return order.status.fulfillment === 'partially_fulfilled';
        if (query.fulfillment === 'fulfilled') return order.status.fulfillment === 'fulfilled';
        return true;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, query.limit ?? 100);
  }

  async getOrder(id: string): Promise<AdminOrder | null> {
    const order = await getStore().get<SandboxOrder>('sandbox', orderKey(id));
    return order ? this.view(order) : null;
  }

  private async mustGetOrder(id: string): Promise<SandboxOrder> {
    const order = await getStore().get<SandboxOrder>('sandbox', orderKey(id));
    if (!order) throw new GatewayNotFoundError('Order');
    return order;
  }

  async updateOrderNote(id: string, note: string): Promise<void> {
    const order = await this.mustGetOrder(id);
    await getStore().put('sandbox', orderKey(id), { ...order, note });
  }

  /** Sandbox orders were never paid, so a "refund" only updates the record. */
  async refundOrder(id: string, input: { amountCents: number }): Promise<void> {
    const order = await this.mustGetOrder(id);
    const refundable = order.total.amount - order.refunded.amount;
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0 || input.amountCents > refundable) {
      throw new GatewayError('That is more than the amount left to refund on this order.');
    }
    const refunded = order.refunded.amount + input.amountCents;
    await getStore().put('sandbox', orderKey(id), {
      ...order,
      refunded: cents(refunded),
      financialStatus: refunded >= order.total.amount ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
    });
  }

  async cancelOrder(id: string, input: { reason: string; refund: boolean }): Promise<void> {
    const order = await this.mustGetOrder(id);
    if (order.cancelledAt) return;
    if (order.fulfillments.length > 0) throw new GatewayError('Items on this order have shipped. Refund instead of cancelling.');
    await getStore().put('sandbox', orderKey(id), {
      ...order,
      cancelledAt: new Date().toISOString(),
      cancelReason: input.reason,
      ...(input.refund ? { refunded: order.total, financialStatus: 'REFUNDED' } : {}),
    });
  }

  async fulfillOrder(id: string, input: FulfillInput): Promise<void> {
    const order = await this.mustGetOrder(id);
    if (order.cancelledAt) throw new GatewayError('A cancelled order cannot be fulfilled.');
    if (order.openFulfillmentOrderIds.length === 0) throw new GatewayError('This order has nothing left to fulfil.');
    await getStore().put('sandbox', orderKey(id), {
      ...order,
      fulfillmentStatus: 'FULFILLED',
      openFulfillmentOrderIds: [],
      fulfillments: [
        ...order.fulfillments,
        {
          id: newId('ful'),
          status: 'SUCCESS',
          createdAt: new Date().toISOString(),
          trackingNumber: input.trackingNumber,
          trackingCompany: input.trackingCompany,
          trackingUrl: input.trackingUrl,
        },
      ],
    });
  }

  /**
   * Creates one clearly flagged TEST order from the first in-stock sandbox
   * variant and decrements sandbox stock, so the order workflow can be tried.
   */
  async createTestOrder(): Promise<AdminOrder> {
    const products = (await this.all<AdminProduct>('product')).filter((product) => product.status === 'ACTIVE');
    const product = products.find((entry) => entry.variants.some((variant) => (variant.inventoryQuantity ?? 0) > 0));
    const variant = product?.variants.find((entry) => (entry.inventoryQuantity ?? 0) > 0);
    if (!product || !variant) throw new GatewayError('No sandbox variant has stock to order. Add stock in Inventory first.');

    const existing = await this.all<SandboxOrder>('order');
    const id = newId('sbxord');
    const order: SandboxOrder = {
      id,
      name: `TEST-${1001 + existing.length}`,
      createdAt: new Date().toISOString(),
      customerName: 'Sandbox test order',
      email: null,
      total: variant.price,
      status: mapOrderStatus({ displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED', cancelledAt: null }),
      itemCount: 1,
      test: true,
      lines: [
        {
          title: product.title,
          variantTitle: variant.title,
          sku: variant.sku,
          quantity: 1,
          unitPrice: variant.price,
          total: variant.price,
          discount: cents(0, variant.price.currency),
        },
      ],
      subtotal: variant.price,
      discounts: cents(0, variant.price.currency),
      discountCodes: [],
      shipping: cents(0, variant.price.currency),
      tax: cents(0, variant.price.currency),
      refunded: cents(0, variant.price.currency),
      note: '',
      cancelledAt: null,
      cancelReason: null,
      shippingAddress: [],
      fulfillments: [],
      openFulfillmentOrderIds: [`${id}-fo1`],
      customerId: null,
      financial: 'PAID',
      fulfillmentStatus: 'UNFULFILLED',
    };
    await getStore().put('sandbox', orderKey(id), order);
    await this.saveProduct({
      ...product,
      variants: product.variants.map((entry) => (entry.id === variant.id ? { ...entry, inventoryQuantity: (entry.inventoryQuantity ?? 1) - 1 } : entry)),
    });
    return this.view(order);
  }

  /* -------------------------- customers -------------------------- */

  async listCustomers(): Promise<AdminCustomerSummary[]> {
    return [];
  }
  async getCustomer(): Promise<AdminCustomer | null> {
    return null;
  }
  async updateCustomer(): Promise<void> {
    throw new GatewayError('The sandbox holds no customer records.');
  }

  /* -------------------------- discounts -------------------------- */

  async createDiscount(offer: Offer): Promise<{ id: string }> {
    const record: SandboxDiscount = { id: newId('sbxdisc'), offerId: offer.id, active: true, createdAt: new Date().toISOString() };
    await getStore().put('sandbox', discountKey(record.id), record);
    return { id: record.id };
  }

  async setDiscountActive(id: string, _method: Offer['method'], active: boolean): Promise<void> {
    const record = await getStore().get<SandboxDiscount>('sandbox', discountKey(id));
    if (!record) throw new GatewayNotFoundError('Discount');
    await getStore().put('sandbox', discountKey(id), { ...record, active });
  }

  async deleteDiscount(id: string): Promise<void> {
    await getStore().delete('sandbox', discountKey(id));
  }

  async discountUsage(): Promise<number | null> {
    return null;
  }

  /* -------------------------- overview -------------------------- */

  async overview(range: { from: string; to: string }): Promise<OverviewMetrics> {
    const orders = (await this.all<SandboxOrder>('order'))
      .map((order) => this.view(order))
      .filter((order) => order.createdAt.slice(0, 10) >= range.from && order.createdAt.slice(0, 10) <= range.to);
    return computeOverview(orders, range, {
      source: 'Sandbox TEST orders only — not real revenue',
      truncated: false,
      newCustomers: null,
      includeTest: true,
    });
  }

  externalUrl(): string | null {
    return null;
  }
}
