/**
 * Shopify gateway — GraphQL Admin API.
 *
 * Every read and write the back office performs against the real store goes
 * through this class, server-side, with the custom-app token. Mutations surface
 * `userErrors` as failures (never as silent successes) and inventory writes use
 * compare-and-set so two operators — or an operator and a sale — cannot
 * overwrite each other.
 *
 * Field and argument names were checked against the 2026-10 reference
 * (shopify.dev/docs/api/admin-graphql). No operation here has been executed
 * against the live store from this codebase: no token existed at build time.
 * docs/admin-operator-guide.md lists each operation for UAT on a dev store.
 */
import 'server-only';

import { randomUUID } from 'node:crypto';

import type { Offer } from '@/domain/offers';
import type { Money } from '@/domain/types';

import { config } from '../config';
import { ShopifyError, adminQuery, assertNoUserErrors, fromGid, toGid, type UserError } from '../shopify/client';

import {
  GatewayConflictError,
  GatewayError,
  GatewayNotFoundError,
  mapOrderStatus,
  type AdminCustomer,
  type AdminCustomerSummary,
  type AdminOrder,
  type AdminOrderSummary,
  type AdminProduct,
  type AdminProductSummary,
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

type Json = Record<string, any>;

interface MoneyV2 {
  amount: string;
  currencyCode: string;
}

const toMoney = (value: MoneyV2 | null | undefined, fallbackCurrency = 'CAD'): Money => ({
  amount: Math.round(Number(value?.amount ?? 0) * 100),
  currency: (value?.currencyCode ?? fallbackCurrency) === 'USD' ? 'USD' : 'CAD',
});

const shopMoney = (set: { shopMoney: MoneyV2 } | null | undefined, currency: string): Money => toMoney(set?.shopMoney, currency);

const decimal = (centsValue: number): string => (centsValue / 100).toFixed(2);

/**
 * Makes operator text safe to embed in a Shopify search query: quotes,
 * parentheses, colons and backslashes are removed so the text can only ever be
 * a plain search term, never a field filter the operator did not intend.
 */
export function searchTerm(input: string | undefined): string {
  return (input ?? '').replace(/["'():\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
}

export function buildOrderQuery(query: OrderQuery): string {
  const parts: string[] = [];
  const term = searchTerm(query.search);
  if (term) parts.push(term);
  const payment = { paid: 'paid', pending: 'pending', refunded: 'refunded', partially_refunded: 'partially_refunded' } as const;
  if (query.payment) parts.push(`financial_status:${payment[query.payment]}`);
  const fulfillment = { unfulfilled: 'unfulfilled', partial: 'partial', fulfilled: 'shipped' } as const;
  if (query.fulfillment) parts.push(`fulfillment_status:${fulfillment[query.fulfillment]}`);
  const date = /^\d{4}-\d{2}-\d{2}$/;
  if (query.from && date.test(query.from)) parts.push(`created_at:>=${query.from}T00:00:00Z`);
  if (query.to && date.test(query.to)) parts.push(`created_at:<=${query.to}T23:59:59Z`);
  return parts.join(' ');
}

/** The discount input an offer maps to. Pure, so it is unit-tested without a network. */
export function buildDiscountInput(
  offer: Offer,
  productIds: readonly string[] | null,
  segmentId: string | null,
  now: Date = new Date(),
): Json {
  const items = productIds === null ? { all: true } : { products: { productsToAdd: productIds.map((id) => toGid('Product', id)) } };
  const base: Json = {
    title: offer.title,
    startsAt: offer.startsAt ?? now.toISOString(),
    endsAt: offer.endsAt,
    combinesWith: {
      productDiscounts: offer.combinesWith.productDiscounts,
      orderDiscounts: offer.combinesWith.orderDiscounts,
      shippingDiscounts: offer.combinesWith.shippingDiscounts,
    },
    customerGets: { value: { percentage: offer.percentOff / 100 }, items },
  };
  if (offer.kind === 'bundle') {
    base.minimumRequirement = { quantity: { greaterThanOrEqualToQuantity: String(offer.minQuantity ?? 2) } };
  }
  if (offer.method === 'code') {
    if (!offer.code) throw new GatewayError('A code offer needs a code.');
    base.code = offer.code;
    base.usageLimit = offer.usageLimit;
    base.appliesOncePerCustomer = offer.oncePerCustomer || offer.audience === 'first_order';
    base.context = segmentId ? { customerSegments: { add: [segmentId] } } : { all: 'ALL' };
  }
  return base;
}

const PRODUCT_SUMMARY = /* GraphQL */ `
  fragment ProductSummary on Product {
    id
    handle
    title
    status
    totalInventory
    tracksInventory
    updatedAt
    variantsCount { count }
    priceRangeV2 { minVariantPrice { amount currencyCode } maxVariantPrice { amount currencyCode } }
    featuredMedia { preview { image { url altText } } }
  }
`;

const ORDER_SUMMARY = /* GraphQL */ `
  fragment OrderSummary on Order {
    id
    name
    createdAt
    test
    cancelledAt
    displayFinancialStatus
    displayFulfillmentStatus
    email
    customer { id displayName }
    currentSubtotalLineItemsQuantity
    currentTotalPriceSet { shopMoney { amount currencyCode } }
    fulfillments(first: 10) { id status createdAt trackingInfo(first: 3) { number company url } }
  }
`;

const ORDER_DETAIL = /* GraphQL */ `
  fragment OrderDetail on Order {
    ...OrderSummary
    note
    cancelReason
    discountCodes
    currentSubtotalPriceSet { shopMoney { amount currencyCode } }
    currentTotalDiscountsSet { shopMoney { amount currencyCode } }
    totalShippingPriceSet { shopMoney { amount currencyCode } }
    currentTotalTaxSet { shopMoney { amount currencyCode } }
    totalRefundedSet { shopMoney { amount currencyCode } }
    shippingAddress { name address1 address2 city provinceCode zip country }
    lineItems(first: 100) {
      nodes {
        title
        variantTitle
        sku
        quantity
        originalUnitPriceSet { shopMoney { amount currencyCode } }
        discountedTotalSet { shopMoney { amount currencyCode } }
        totalDiscountSet { shopMoney { amount currencyCode } }
      }
    }
    fulfillmentOrders(first: 20) { nodes { id status } }
  }
  ${ORDER_SUMMARY}
`;

const FIRST_ORDER_SEGMENT = 'INFNITY — no previous orders';

export class ShopifyAdminGateway implements CommerceGateway {
  readonly mode = 'shopify' as const;
  readonly sourceLabel: string;
  private currency: string | null = null;

  constructor(private readonly fetcher?: typeof fetch) {
    this.sourceLabel = `Shopify — ${config.shopify.storeDomain}`;
  }

  private query<T = Json>(query: string, variables: Json = {}): Promise<T> {
    return adminQuery<T>(query, { variables, fetcher: this.fetcher });
  }

  /** Runs a mutation and raises on `userErrors` under the named payload. */
  private async mutate(query: string, variables: Json, payload: string, errorsKey = 'userErrors'): Promise<Json> {
    const data = await this.query<Json>(query, variables);
    const result = data[payload] as Json | null;
    if (!result) throw new GatewayError('Shopify returned no result for this change.');
    assertNoUserErrors(result[errorsKey] as UserError[]);
    return result;
  }

  private async shopCurrency(): Promise<string> {
    if (!this.currency) {
      const data = await this.query<{ shop: { currencyCode: string } }>(`query ShopCurrency { shop { currencyCode } }`);
      this.currency = data.shop.currencyCode;
    }
    return this.currency;
  }

  /* -------------------------- products -------------------------- */

  private summary(node: Json): AdminProductSummary {
    const image = node.featuredMedia?.preview?.image;
    return {
      id: fromGid(node.id),
      handle: node.handle,
      title: node.title,
      status: node.status as ProductStatus,
      totalInventory: node.tracksInventory ? (node.totalInventory ?? 0) : null,
      priceMin: node.priceRangeV2 ? toMoney(node.priceRangeV2.minVariantPrice) : null,
      priceMax: node.priceRangeV2 ? toMoney(node.priceRangeV2.maxVariantPrice) : null,
      image: image?.url ? { url: image.url, alt: image.altText ?? node.title } : null,
      variantCount: node.variantsCount?.count ?? 0,
      updatedAt: node.updatedAt,
    };
  }

  async listProducts(query: { search?: string; status?: ProductStatus | '' } = {}): Promise<AdminProductSummary[]> {
    const parts = [searchTerm(query.search), query.status ? `status:${query.status.toLowerCase()}` : ''].filter(Boolean);
    const products: AdminProductSummary[] = [];
    let after: string | null = null;
    for (let page = 0; page < 5; page += 1) {
      const data: Json = await this.query(
        `query Products($first: Int!, $query: String, $after: String) {
          products(first: $first, query: $query, after: $after, sortKey: UPDATED_AT, reverse: true) {
            pageInfo { hasNextPage endCursor }
            nodes { ...ProductSummary }
          }
        }
        ${PRODUCT_SUMMARY}`,
        { first: 50, query: parts.join(' ') || null, after },
      );
      products.push(...data.products.nodes.map((node: Json) => this.summary(node)));
      if (!data.products.pageInfo.hasNextPage) break;
      after = data.products.pageInfo.endCursor;
    }
    return products;
  }

  async getProduct(id: string): Promise<AdminProduct | null> {
    const currency = await this.shopCurrency();
    const data = await this.query(
      `query Product($id: ID!) {
        product(id: $id) {
          ...ProductSummary
          descriptionHtml
          productType
          vendor
          tags
          seo { title description }
          options { name values }
          media(first: 30) { nodes { id alt preview { image { url } } } }
          variants(first: 100) {
            nodes {
              id
              title
              barcode
              price
              compareAtPrice
              inventoryQuantity
              selectedOptions { name value }
              inventoryItem { id tracked sku measurement { weight { value unit } } }
            }
          }
        }
      }
      ${PRODUCT_SUMMARY}`,
      { id: toGid('Product', id) },
    );
    const node = data.product as Json | null;
    if (!node) return null;

    const grams = (weight: { value: number; unit: string } | null | undefined): number | null => {
      if (!weight) return null;
      const factor = { GRAMS: 1, KILOGRAMS: 1000, OUNCES: 28.3495, POUNDS: 453.592 }[weight.unit] ?? 1;
      return Math.round(weight.value * factor);
    };
    const placeholder = (options: Json[]) => options.length === 1 && options[0]?.name === 'Title' && options[0]?.values?.length === 1 && options[0]?.values?.[0] === 'Default Title';

    return {
      ...this.summary(node),
      descriptionHtml: node.descriptionHtml ?? '',
      productType: node.productType ?? '',
      vendor: node.vendor ?? '',
      tags: node.tags ?? [],
      seoTitle: node.seo?.title ?? '',
      seoDescription: node.seo?.description ?? '',
      options: placeholder(node.options) ? [] : node.options.map((option: Json) => ({ name: option.name, values: option.values })),
      media: node.media.nodes
        .filter((media: Json) => media.preview?.image?.url)
        .map((media: Json) => ({ id: media.id, url: media.preview.image.url, alt: media.alt ?? '' })),
      variants: node.variants.nodes.map((variant: Json) => {
        const price = Math.round(Number(variant.price) * 100);
        const compareAt = variant.compareAtPrice ? Math.round(Number(variant.compareAtPrice) * 100) : null;
        return {
          id: fromGid(variant.id),
          title: variant.title === 'Default Title' ? 'Default' : variant.title,
          options: variant.selectedOptions.filter((option: Json) => option.name !== 'Title' || option.value !== 'Default Title'),
          price: { amount: price, currency: currency === 'USD' ? 'USD' : 'CAD' },
          compareAtPrice: compareAt && compareAt > price ? { amount: compareAt, currency: currency === 'USD' ? 'USD' : 'CAD' } : null,
          sku: variant.inventoryItem?.sku || null,
          barcode: variant.barcode || null,
          weightGrams: grams(variant.inventoryItem?.measurement?.weight),
          inventoryItemId: variant.inventoryItem?.id ? fromGid(variant.inventoryItem.id) : null,
          inventoryQuantity: variant.inventoryItem?.tracked ? (variant.inventoryQuantity ?? 0) : null,
        };
      }),
    };
  }

  private async mustGetProduct(id: string): Promise<AdminProduct> {
    const product = await this.getProduct(id);
    if (!product) throw new GatewayNotFoundError('Product');
    return product;
  }

  private productFields(input: ProductInput): Json {
    return {
      title: input.title,
      descriptionHtml: input.descriptionHtml,
      productType: input.productType,
      vendor: input.vendor,
      tags: [...input.tags],
      status: input.status,
      seo: { title: input.seoTitle || null, description: input.seoDescription || null },
    };
  }

  /**
   * A product created through the API is not on any sales channel. This puts it
   * on the Online Store publication (which the Storefront API serves) and on a
   * Headless/Hydrogen publication when one exists.
   */
  private async publish(productId: string): Promise<void> {
    const data = await this.query(`query Publications { publications(first: 30) { nodes { id name } } }`);
    const targets = (data.publications.nodes as Json[]).filter((publication) => /online store|headless|hydrogen/i.test(publication.name));
    if (targets.length === 0) return;
    await this.mutate(
      `mutation Publish($id: ID!, $input: [PublicationInput!]!) {
        publishablePublish(id: $id, input: $input) { userErrors { field message } }
      }`,
      { id: toGid('Product', productId), input: targets.map((publication) => ({ publicationId: publication.id })) },
      'publishablePublish',
    );
  }

  async createProduct(input: ProductCreateInput): Promise<AdminProduct> {
    const combinations = input.options.reduce<Array<Array<{ optionName: string; name: string }>>>(
      (all, option) => all.flatMap((combination) => option.values.map((value) => [...combination, { optionName: option.name, name: value }])),
      [[]],
    );
    if (combinations.length > 100) throw new GatewayError('A product can have at most 100 variants here.');

    const productSet: Json = this.productFields(input);
    if (input.options.length) {
      productSet.productOptions = input.options.map((option, index) => ({
        name: option.name,
        position: index + 1,
        values: option.values.map((value) => ({ name: value })),
      }));
      productSet.variants = combinations.map((optionValues) => ({
        optionValues,
        price: decimal(input.price),
        compareAtPrice: input.compareAtPrice && input.compareAtPrice > input.price ? decimal(input.compareAtPrice) : null,
        inventoryItem: {
          tracked: true,
          sku: input.skuPrefix ? `${input.skuPrefix}-${optionValues.map((value) => value.name.toUpperCase().replace(/[^A-Z0-9]+/g, '')).join('-')}` : null,
        },
      }));
    }

    const result = await this.mutate(
      `mutation ProductCreate($input: ProductSetInput!) {
        productSet(synchronous: true, input: $input) {
          product { id }
          userErrors { field message }
        }
      }`,
      { input: productSet },
      'productSet',
    );
    const id = fromGid(result.product.id);

    if (!input.options.length) {
      // The default variant is created by Shopify; price it now.
      const created = await this.mustGetProduct(id);
      const variant = created.variants[0];
      if (variant) {
        await this.updateVariants(id, [
          { id: variant.id, price: input.price, compareAtPrice: input.compareAtPrice, sku: input.skuPrefix, barcode: null, weightGrams: null },
        ]);
      }
    }
    if (input.status === 'ACTIVE') await this.publish(id);
    return this.mustGetProduct(id);
  }

  async updateProduct(id: string, input: ProductInput): Promise<AdminProduct> {
    const before = await this.mustGetProduct(id);
    await this.mutate(
      `mutation ProductUpdate($product: ProductUpdateInput!) {
        productUpdate(product: $product) { product { id } userErrors { field message } }
      }`,
      { product: { id: toGid('Product', id), ...this.productFields(input) } },
      'productUpdate',
    );
    if (input.status === 'ACTIVE' && before.status !== 'ACTIVE') await this.publish(id);
    return this.mustGetProduct(id);
  }

  async updateVariants(productId: string, variants: readonly VariantUpdate[]): Promise<void> {
    if (variants.length === 0) return;
    await this.mutate(
      `mutation VariantsUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          productVariants { id }
          userErrors { field message }
        }
      }`,
      {
        productId: toGid('Product', productId),
        variants: variants.map((variant) => ({
          id: toGid('ProductVariant', variant.id),
          price: decimal(variant.price),
          compareAtPrice: variant.compareAtPrice && variant.compareAtPrice > variant.price ? decimal(variant.compareAtPrice) : null,
          barcode: variant.barcode,
          inventoryItem: {
            sku: variant.sku,
            ...(variant.weightGrams !== null ? { measurement: { weight: { value: variant.weightGrams, unit: 'GRAMS' } } } : {}),
          },
        })),
      },
      'productVariantsBulkUpdate',
    );
  }

  async duplicateProduct(id: string, newTitle: string): Promise<AdminProduct> {
    const result = await this.mutate(
      `mutation ProductDuplicate($productId: ID!, $newTitle: String!) {
        productDuplicate(productId: $productId, newTitle: $newTitle, newStatus: DRAFT, includeImages: true) {
          newProduct { id }
          userErrors { field message }
        }
      }`,
      { productId: toGid('Product', id), newTitle },
      'productDuplicate',
    );
    return this.mustGetProduct(fromGid(result.newProduct.id));
  }

  async setProductStatus(id: string, status: ProductStatus): Promise<void> {
    await this.mutate(
      `mutation ProductStatus($product: ProductUpdateInput!) {
        productUpdate(product: $product) { product { id } userErrors { field message } }
      }`,
      { product: { id: toGid('Product', id), status } },
      'productUpdate',
    );
    if (status === 'ACTIVE') await this.publish(id);
  }

  async addProductImage(id: string, url: string, alt: string): Promise<void> {
    await this.mutate(
      `mutation ProductImage($productId: ID!, $media: [CreateMediaInput!]!) {
        productCreateMedia(productId: $productId, media: $media) {
          media { id }
          mediaUserErrors { field message }
        }
      }`,
      { productId: toGid('Product', id), media: [{ originalSource: url, alt, mediaContentType: 'IMAGE' }] },
      'productCreateMedia',
      'mediaUserErrors',
    );
  }

  /* -------------------------- inventory -------------------------- */

  async listInventory(): Promise<InventoryRow[]> {
    const rows: InventoryRow[] = [];
    let after: string | null = null;
    for (let page = 0; page < 20; page += 1) {
      const data: Json = await this.query(
        `query Inventory($first: Int!, $after: String) {
          productVariants(first: $first, after: $after) {
            pageInfo { hasNextPage endCursor }
            nodes {
              id
              title
              product { id title status }
              inventoryItem {
                id
                sku
                tracked
                inventoryLevels(first: 5) {
                  nodes {
                    location { id name }
                    quantities(names: ["available", "committed", "on_hand", "reserved", "damaged", "safety_stock", "quality_control"]) { name quantity }
                  }
                }
              }
            }
          }
        }`,
        { first: 50, after },
      );
      for (const variant of data.productVariants.nodes as Json[]) {
        if (variant.product.status === 'ARCHIVED' || !variant.inventoryItem) continue;
        for (const level of variant.inventoryItem.inventoryLevels.nodes as Json[]) {
          const quantity = (name: string): number | null =>
            (level.quantities as Json[]).find((entry) => entry.name === name)?.quantity ?? null;
          const unavailable = ['reserved', 'damaged', 'safety_stock', 'quality_control']
            .map(quantity)
            .reduce<number | null>((total, value) => (value === null ? total : (total ?? 0) + value), null);
          rows.push({
            productId: fromGid(variant.product.id),
            productTitle: variant.product.title,
            variantId: fromGid(variant.id),
            variantTitle: variant.title === 'Default Title' ? 'Default' : variant.title,
            sku: variant.inventoryItem.sku || null,
            inventoryItemId: fromGid(variant.inventoryItem.id),
            tracked: Boolean(variant.inventoryItem.tracked),
            locationId: fromGid(level.location.id),
            locationName: level.location.name,
            available: quantity('available') ?? 0,
            committed: quantity('committed'),
            unavailable,
            onHand: quantity('on_hand'),
          });
        }
      }
      if (!data.productVariants.pageInfo.hasNextPage) break;
      after = data.productVariants.pageInfo.endCursor;
    }
    return rows.sort((a, b) => a.productTitle.localeCompare(b.productTitle));
  }

  async setInventory(input: InventorySetInput): Promise<void> {
    if (!Number.isInteger(input.quantity) || input.quantity < 0) throw new GatewayError('Quantity must be zero or more.');
    let data: Json;
    try {
      data = await this.query(
        `mutation InventorySet($input: InventorySetQuantitiesInput!, $idempotencyKey: String!) {
          inventorySetQuantities(input: $input) @idempotent(key: $idempotencyKey) {
            inventoryAdjustmentGroup { id }
            userErrors { code field message }
          }
        }`,
        {
          idempotencyKey: randomUUID(),
          input: {
            name: 'available',
            reason: input.reason,
            quantities: [
              {
                inventoryItemId: toGid('InventoryItem', input.inventoryItemId),
                locationId: toGid('Location', input.locationId),
                quantity: input.quantity,
                // Compare-and-set: Shopify applies the write only if the
                // quantity is still what the operator saw.
                changeFromQuantity: input.expectedQuantity,
              },
            ],
          },
        },
      );
    } catch (error) {
      if (error instanceof ShopifyError) throw new GatewayError(error.message);
      throw error;
    }
    const errors = (data.inventorySetQuantities?.userErrors ?? []) as Array<UserError & { code?: string }>;
    if (errors.some((error) => /STALE|COMPARE|CHANGE_FROM/i.test(error.code ?? ''))) throw new GatewayConflictError();
    assertNoUserErrors(errors);
  }

  /* -------------------------- orders -------------------------- */

  private orderSummary(node: Json, currency: string): AdminOrderSummary {
    const fulfillments = (node.fulfillments ?? []) as Json[];
    return {
      id: fromGid(node.id),
      name: node.name,
      createdAt: node.createdAt,
      customerName: node.customer?.displayName ?? null,
      email: node.email ?? null,
      total: shopMoney(node.currentTotalPriceSet, currency),
      status: mapOrderStatus({
        displayFinancialStatus: node.displayFinancialStatus,
        displayFulfillmentStatus: node.displayFulfillmentStatus,
        cancelledAt: node.cancelledAt,
        trackingNumbers: fulfillments.flatMap((fulfillment) => (fulfillment.trackingInfo ?? []).map((info: Json) => info.number)),
      }),
      itemCount: node.currentSubtotalLineItemsQuantity ?? 0,
      test: Boolean(node.test),
    };
  }

  private orderDetail(node: Json, currency: string): AdminOrder {
    const address = node.shippingAddress as Json | null;
    return {
      ...this.orderSummary(node, currency),
      lines: (node.lineItems.nodes as Json[]).map((line) => ({
        title: line.title,
        variantTitle: line.variantTitle || null,
        sku: line.sku || null,
        quantity: line.quantity,
        unitPrice: shopMoney(line.originalUnitPriceSet, currency),
        total: shopMoney(line.discountedTotalSet, currency),
        discount: shopMoney(line.totalDiscountSet, currency),
      })),
      subtotal: shopMoney(node.currentSubtotalPriceSet, currency),
      discounts: shopMoney(node.currentTotalDiscountsSet, currency),
      discountCodes: node.discountCodes ?? [],
      shipping: shopMoney(node.totalShippingPriceSet, currency),
      tax: shopMoney(node.currentTotalTaxSet, currency),
      refunded: shopMoney(node.totalRefundedSet, currency),
      note: node.note ?? '',
      cancelledAt: node.cancelledAt ?? null,
      cancelReason: node.cancelReason ?? null,
      shippingAddress: address
        ? [address.name, address.address1, address.address2, [address.city, address.provinceCode, address.zip].filter(Boolean).join(' '), address.country].filter(Boolean)
        : [],
      fulfillments: ((node.fulfillments ?? []) as Json[]).map((fulfillment) => ({
        id: fromGid(fulfillment.id),
        status: fulfillment.status,
        createdAt: fulfillment.createdAt,
        trackingNumber: fulfillment.trackingInfo?.[0]?.number ?? null,
        trackingCompany: fulfillment.trackingInfo?.[0]?.company ?? null,
        trackingUrl: fulfillment.trackingInfo?.[0]?.url ?? null,
      })),
      openFulfillmentOrderIds: ((node.fulfillmentOrders?.nodes ?? []) as Json[])
        .filter((fulfillmentOrder) => fulfillmentOrder.status === 'OPEN' || fulfillmentOrder.status === 'IN_PROGRESS')
        .map((fulfillmentOrder) => fulfillmentOrder.id as string),
      customerId: node.customer?.id ? fromGid(node.customer.id) : null,
    };
  }

  async listOrders(query: OrderQuery = {}): Promise<AdminOrderSummary[]> {
    const currency = await this.shopCurrency();
    const data = await this.query(
      `query Orders($first: Int!, $query: String) {
        orders(first: $first, query: $query, sortKey: CREATED_AT, reverse: true) { nodes { ...OrderSummary } }
      }
      ${ORDER_SUMMARY}`,
      { first: Math.min(query.limit ?? 100, 250), query: buildOrderQuery(query) || null },
    );
    return (data.orders.nodes as Json[]).map((node) => this.orderSummary(node, currency));
  }

  async getOrder(id: string): Promise<AdminOrder | null> {
    const currency = await this.shopCurrency();
    const data = await this.query(`query Order($id: ID!) { order(id: $id) { ...OrderDetail } } ${ORDER_DETAIL}`, { id: toGid('Order', id) });
    return data.order ? this.orderDetail(data.order, currency) : null;
  }

  async updateOrderNote(id: string, note: string): Promise<void> {
    await this.mutate(
      `mutation OrderNote($input: OrderInput!) { orderUpdate(input: $input) { order { id } userErrors { field message } } }`,
      { input: { id: toGid('Order', id), note } },
      'orderUpdate',
    );
  }

  async fulfillOrder(id: string, input: FulfillInput): Promise<void> {
    const order = await this.getOrder(id);
    if (!order) throw new GatewayNotFoundError('Order');
    if (order.status.cancelled) throw new GatewayError('A cancelled order cannot be fulfilled.');
    if (order.openFulfillmentOrderIds.length === 0) throw new GatewayError('This order has nothing left to fulfil.');
    const tracking = input.trackingNumber
      ? { number: input.trackingNumber, company: input.trackingCompany, url: input.trackingUrl }
      : null;
    await this.mutate(
      `mutation Fulfill($fulfillment: FulfillmentInput!) {
        fulfillmentCreate(fulfillment: $fulfillment) { fulfillment { id status } userErrors { field message } }
      }`,
      {
        fulfillment: {
          lineItemsByFulfillmentOrder: order.openFulfillmentOrderIds.map((fulfillmentOrderId) => ({ fulfillmentOrderId })),
          notifyCustomer: input.notifyCustomer,
          ...(tracking ? { trackingInfo: tracking } : {}),
        },
      },
      'fulfillmentCreate',
    );
  }

  /* -------------------------- customers -------------------------- */

  private customerSummary(node: Json): AdminCustomerSummary {
    return {
      id: fromGid(node.id),
      name: node.displayName ?? '',
      email: node.defaultEmailAddress?.emailAddress ?? null,
      ordersCount: Number(node.numberOfOrders ?? 0),
      totalSpent: node.amountSpent ? toMoney(node.amountSpent) : null,
      lastOrderAt: node.lastOrder?.createdAt ?? null,
      marketingState: String(node.defaultEmailAddress?.marketingState ?? 'unknown').toLowerCase(),
      tags: node.tags ?? [],
      createdAt: node.createdAt,
    };
  }

  private static readonly CUSTOMER_FIELDS = `
    id
    displayName
    numberOfOrders
    amountSpent { amount currencyCode }
    lastOrder { createdAt }
    tags
    createdAt
    defaultEmailAddress { emailAddress marketingState }
  `;

  async listCustomers(query: { search?: string } = {}): Promise<AdminCustomerSummary[]> {
    const data = await this.query(
      `query Customers($first: Int!, $query: String) {
        customers(first: $first, query: $query, sortKey: UPDATED_AT, reverse: true) { nodes { ${ShopifyAdminGateway.CUSTOMER_FIELDS} } }
      }`,
      { first: 100, query: searchTerm(query.search) || null },
    );
    return (data.customers.nodes as Json[]).map((node) => this.customerSummary(node));
  }

  async getCustomer(id: string): Promise<AdminCustomer | null> {
    const currency = await this.shopCurrency();
    const data = await this.query(
      `query Customer($id: ID!) {
        customer(id: $id) {
          ${ShopifyAdminGateway.CUSTOMER_FIELDS}
          note
          defaultPhoneNumber { phoneNumber }
          defaultAddress { city province country }
          orders(first: 25, sortKey: CREATED_AT, reverse: true) { nodes { ...OrderSummary } }
        }
      }
      ${ORDER_SUMMARY}`,
      { id: toGid('Customer', id) },
    );
    const node = data.customer as Json | null;
    if (!node) return null;
    const address = node.defaultAddress as Json | null;
    return {
      ...this.customerSummary(node),
      phone: node.defaultPhoneNumber?.phoneNumber ?? null,
      note: node.note ?? '',
      location: address ? [address.city, address.province, address.country].filter(Boolean).join(', ') : null,
      orders: (node.orders.nodes as Json[]).map((order) => this.orderSummary(order, currency)),
    };
  }

  async updateCustomer(id: string, input: { note: string; tags: readonly string[] }): Promise<void> {
    await this.mutate(
      `mutation CustomerUpdate($input: CustomerInput!) { customerUpdate(input: $input) { customer { id } userErrors { field message } } }`,
      { input: { id: toGid('Customer', id), note: input.note, tags: [...input.tags] } },
      'customerUpdate',
    );
  }

  /* -------------------------- discounts -------------------------- */

  private async firstOrderSegment(): Promise<string> {
    const data = await this.query(`query Segments { segments(first: 100) { nodes { id name } } }`);
    const existing = (data.segments.nodes as Json[]).find((segment) => segment.name === FIRST_ORDER_SEGMENT);
    if (existing) return existing.id as string;
    const result = await this.mutate(
      `mutation SegmentCreate($name: String!, $query: String!) {
        segmentCreate(name: $name, query: $query) { segment { id } userErrors { field message } }
      }`,
      { name: FIRST_ORDER_SEGMENT, query: 'number_of_orders = 0' },
      'segmentCreate',
    );
    return result.segment.id as string;
  }

  async createDiscount(offer: Offer, productIds: readonly string[] | null): Promise<{ id: string }> {
    if (offer.method === 'code') {
      const segmentId = offer.audience === 'first_order' ? await this.firstOrderSegment() : null;
      const result = await this.mutate(
        `mutation DiscountCode($basicCodeDiscount: DiscountCodeBasicInput!) {
          discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
            codeDiscountNode { id }
            userErrors { field code message }
          }
        }`,
        { basicCodeDiscount: buildDiscountInput(offer, productIds, segmentId) },
        'discountCodeBasicCreate',
      );
      return { id: result.codeDiscountNode.id as string };
    }
    const result = await this.mutate(
      `mutation DiscountAutomatic($automaticBasicDiscount: DiscountAutomaticBasicInput!) {
        discountAutomaticBasicCreate(automaticBasicDiscount: $automaticBasicDiscount) {
          automaticDiscountNode { id }
          userErrors { field code message }
        }
      }`,
      { automaticBasicDiscount: buildDiscountInput(offer, productIds, null) },
      'discountAutomaticBasicCreate',
    );
    return { id: result.automaticDiscountNode.id as string };
  }

  async setDiscountActive(id: string, method: Offer['method'], active: boolean): Promise<void> {
    const name = `discount${method === 'code' ? 'Code' : 'Automatic'}${active ? 'Activate' : 'Deactivate'}`;
    const node = method === 'code' ? 'codeDiscountNode' : 'automaticDiscountNode';
    await this.mutate(`mutation DiscountToggle($id: ID!) { ${name}(id: $id) { ${node} { id } userErrors { field message } } }`, { id }, name);
  }

  async deleteDiscount(id: string, method: Offer['method']): Promise<void> {
    const name = method === 'code' ? 'discountCodeDelete' : 'discountAutomaticDelete';
    const deleted = method === 'code' ? 'deletedCodeDiscountId' : 'deletedAutomaticDiscountId';
    await this.mutate(`mutation DiscountDelete($id: ID!) { ${name}(id: $id) { ${deleted} userErrors { field message } } }`, { id }, name);
  }

  async discountUsage(id: string, method: Offer['method']): Promise<number | null> {
    try {
      if (method === 'code') {
        const data = await this.query(
          `query CodeUsage($id: ID!) { codeDiscountNode(id: $id) { codeDiscount { ... on DiscountCodeBasic { asyncUsageCount } } } }`,
          { id },
        );
        return data.codeDiscountNode?.codeDiscount?.asyncUsageCount ?? null;
      }
      const data = await this.query(
        `query AutomaticUsage($id: ID!) { automaticDiscountNode(id: $id) { automaticDiscount { ... on DiscountAutomaticBasic { asyncUsageCount } } } }`,
        { id },
      );
      return data.automaticDiscountNode?.automaticDiscount?.asyncUsageCount ?? null;
    } catch {
      return null;
    }
  }

  /* -------------------------- overview -------------------------- */

  async overview(range: { from: string; to: string }): Promise<OverviewMetrics> {
    const currency = await this.shopCurrency();
    const orders: AdminOrder[] = [];
    let after: string | null = null;
    let truncated = false;
    const maxPages = 10;
    for (let page = 0; page < maxPages; page += 1) {
      const data: Json = await this.query(
        `query OverviewOrders($first: Int!, $query: String, $after: String) {
          orders(first: $first, query: $query, after: $after, sortKey: CREATED_AT, reverse: true) {
            pageInfo { hasNextPage endCursor }
            nodes { ...OrderDetail }
          }
        }
        ${ORDER_DETAIL}`,
        { first: 40, query: buildOrderQuery({ from: range.from, to: range.to }), after },
      );
      orders.push(...(data.orders.nodes as Json[]).map((node) => this.orderDetail(node, currency)));
      if (!data.orders.pageInfo.hasNextPage) break;
      after = data.orders.pageInfo.endCursor;
      if (page === maxPages - 1) truncated = true;
    }

    let newCustomers: number | null = null;
    try {
      const data = await this.query(`query NewCustomers($query: String) { customersCount(query: $query) { count } }`, {
        query: `customer_date:>=${range.from} customer_date:<=${range.to}`,
      });
      newCustomers = data.customersCount?.count ?? null;
    } catch {
      newCustomers = null;
    }

    return computeOverview(orders, range, { source: this.sourceLabel, truncated, newCustomers, currency });
  }

  externalUrl(kind: 'order' | 'product' | 'customer' | 'settings', idOrPath: string): string | null {
    const handle = config.shopify.storeDomain.replace(/\.myshopify\.com$/, '');
    const base = `https://admin.shopify.com/store/${handle}`;
    if (kind === 'settings') return `${base}/settings/${idOrPath.replace(/[^a-z/_-]/gi, '')}`;
    const section = { order: 'orders', product: 'products', customer: 'customers' }[kind];
    return `${base}/${section}/${encodeURIComponent(fromGid(idOrPath))}`;
  }
}
