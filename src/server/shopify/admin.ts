import 'server-only';

import { shopifyConfig } from './config';
import { assertNoUserErrors, shopifyGraphql, ShopifyApiError, toGid } from './graphql';

/**
 * Shopify Admin GraphQL — server only. The token never leaves this module.
 *
 * Every write returns Shopify's own result; a mutation with `userErrors` throws
 * (see `assertNoUserErrors`). Money-moving operations (refunds, cancellations)
 * are deliberately NOT executed from here: the back office records a request
 * and links to Shopify admin, where the owner completes it with Shopify's own
 * safeguards.
 */

export async function adminRequest<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const config = shopifyConfig();
  if (!config.adminToken) {
    throw new ShopifyApiError('The Shopify Admin API is not configured (SHOPIFY_ADMIN_ACCESS_TOKEN).', 'not_configured');
  }
  return shopifyGraphql<T>({
    endpoint: `https://${config.storeDomain}/admin/api/${config.apiVersion}/graphql.json`,
    headers: { 'X-Shopify-Access-Token': config.adminToken },
    query,
    variables,
  });
}

/** Deep link into Shopify admin for actions we intentionally do not replicate. */
export function shopifyAdminUrl(path: string): string {
  const handle = shopifyConfig().storeDomain.replace('.myshopify.com', '');
  return `https://admin.shopify.com/store/${handle}/${path.replace(/^\//, '')}`;
}

type MoneyNode = { amount: string; currencyCode: string };

/* ------------------------------------------------------------------ *
 * Shop, locations, publications
 * ------------------------------------------------------------------ */

export async function getShopInfo() {
  return adminRequest<{
    shop: { name: string; currencyCode: string; myshopifyDomain: string; primaryDomain: { url: string }; contactEmail: string | null };
    locations: { nodes: Array<{ id: string; name: string; isActive: boolean }> };
    publications: { nodes: Array<{ id: string; name: string }> };
  }>(/* GraphQL */ `
    query ShopInfo {
      shop { name currencyCode myshopifyDomain primaryDomain { url } contactEmail }
      locations(first: 20) { nodes { id name isActive } }
      publications(first: 20) { nodes { id name } }
    }
  `);
}

/* ------------------------------------------------------------------ *
 * Products
 * ------------------------------------------------------------------ */

export interface AdminProductSummary {
  id: string;
  handle: string;
  title: string;
  status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED' | 'UNLISTED';
  totalInventory: number | null;
  updatedAt: string;
  featuredImage: string | null;
  variantsCount: number;
  minPrice: MoneyNode | null;
}

export async function listProducts(search: string | null, after: string | null = null) {
  const data = await adminRequest<{
    products: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: Array<{
        id: string;
        handle: string;
        title: string;
        status: AdminProductSummary['status'];
        totalInventory: number | null;
        updatedAt: string;
        featuredMedia: { preview: { image: { url: string } | null } | null } | null;
        variantsCount: { count: number } | null;
        priceRangeV2: { minVariantPrice: MoneyNode } | null;
      }>;
    };
  }>(
    /* GraphQL */ `
      query AdminProducts($query: String, $after: String) {
        products(first: 50, after: $after, query: $query, sortKey: UPDATED_AT, reverse: true) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id handle title status totalInventory updatedAt
            featuredMedia { preview { image { url } } }
            variantsCount { count }
            priceRangeV2 { minVariantPrice { amount currencyCode } }
          }
        }
      }
    `,
    { query: search || null, after },
  );
  return {
    pageInfo: data.products.pageInfo,
    products: data.products.nodes.map(
      (node): AdminProductSummary => ({
        id: node.id,
        handle: node.handle,
        title: node.title,
        status: node.status,
        totalInventory: node.totalInventory,
        updatedAt: node.updatedAt,
        featuredImage: node.featuredMedia?.preview?.image?.url ?? null,
        variantsCount: node.variantsCount?.count ?? 0,
        minPrice: node.priceRangeV2?.minVariantPrice ?? null,
      }),
    ),
  };
}

export interface AdminProductDetail {
  id: string;
  handle: string;
  title: string;
  descriptionHtml: string;
  productType: string;
  vendor: string;
  status: AdminProductSummary['status'];
  tags: string[];
  seo: { title: string | null; description: string | null };
  onlineStoreUrl: string | null;
  options: Array<{ id: string; name: string; position: number; values: string[] }>;
  media: Array<{ id: string; url: string; alt: string | null }>;
  variants: Array<{
    id: string;
    title: string;
    sku: string | null;
    barcode: string | null;
    price: string;
    compareAtPrice: string | null;
    selectedOptions: Array<{ name: string; value: string }>;
    inventoryItemId: string;
    tracked: boolean;
    weight: { value: number; unit: string } | null;
    inventory: Array<{ locationId: string; locationName: string; available: number; committed: number; onHand: number; reserved: number }>;
  }>;
  metafields: Record<string, string>;
}

export async function getProduct(id: string): Promise<AdminProductDetail | null> {
  const data = await adminRequest<{
    product: {
      id: string;
      handle: string;
      title: string;
      descriptionHtml: string;
      productType: string;
      vendor: string;
      status: AdminProductSummary['status'];
      tags: string[];
      onlineStoreUrl: string | null;
      seo: { title: string | null; description: string | null };
      options: Array<{ id: string; name: string; position: number; optionValues: Array<{ name: string }> }>;
      media: { nodes: Array<{ id: string; alt: string | null; image?: { url: string } | null }> };
      variants: {
        nodes: Array<{
          id: string;
          title: string;
          sku: string | null;
          barcode: string | null;
          price: string;
          compareAtPrice: string | null;
          selectedOptions: Array<{ name: string; value: string }>;
          inventoryItem: {
            id: string;
            tracked: boolean;
            measurement: { weight: { value: number; unit: string } | null } | null;
            inventoryLevels: {
              nodes: Array<{ location: { id: string; name: string }; quantities: Array<{ name: string; quantity: number }> }>;
            };
          };
        }>;
      };
      metafields: { nodes: Array<{ key: string; value: string }> };
    } | null;
  }>(
    /* GraphQL */ `
      query AdminProduct($id: ID!) {
        product(id: $id) {
          id handle title descriptionHtml productType vendor status tags onlineStoreUrl
          seo { title description }
          options { id name position optionValues { name } }
          media(first: 30) { nodes { id alt ... on MediaImage { image { url } } } }
          variants(first: 100) {
            nodes {
              id title sku barcode price compareAtPrice
              selectedOptions { name value }
              inventoryItem {
                id tracked
                measurement { weight { value unit } }
                inventoryLevels(first: 10) {
                  nodes {
                    location { id name }
                    quantities(names: ["available", "committed", "on_hand", "reserved"]) { name quantity }
                  }
                }
              }
            }
          }
          metafields(namespace: "infnity", first: 20) { nodes { key value } }
        }
      }
    `,
    { id: toGid('Product', id) },
  );
  const product = data.product;
  if (!product) return null;
  return {
    id: product.id,
    handle: product.handle,
    title: product.title,
    descriptionHtml: product.descriptionHtml,
    productType: product.productType,
    vendor: product.vendor,
    status: product.status,
    tags: product.tags,
    seo: product.seo,
    onlineStoreUrl: product.onlineStoreUrl,
    options: product.options.map((option) => ({
      id: option.id,
      name: option.name,
      position: option.position,
      values: option.optionValues.map((value) => value.name),
    })),
    media: product.media.nodes.filter((node) => node.image?.url).map((node) => ({ id: node.id, url: node.image!.url, alt: node.alt })),
    variants: product.variants.nodes.map((variant) => ({
      id: variant.id,
      title: variant.title,
      sku: variant.sku,
      barcode: variant.barcode,
      price: variant.price,
      compareAtPrice: variant.compareAtPrice,
      selectedOptions: variant.selectedOptions,
      inventoryItemId: variant.inventoryItem.id,
      tracked: variant.inventoryItem.tracked,
      weight: variant.inventoryItem.measurement?.weight ?? null,
      inventory: variant.inventoryItem.inventoryLevels.nodes.map((level) => {
        const q = (name: string) => level.quantities.find((entry) => entry.name === name)?.quantity ?? 0;
        return {
          locationId: level.location.id,
          locationName: level.location.name,
          available: q('available'),
          committed: q('committed'),
          onHand: q('on_hand'),
          reserved: q('reserved'),
        };
      }),
    })),
    metafields: Object.fromEntries(product.metafields.nodes.map((field) => [field.key, field.value])),
  };
}

export interface ProductWriteInput {
  id?: string | null;
  title: string;
  handle?: string | null;
  descriptionHtml: string;
  productType: string;
  vendor: string;
  status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
  tags: string[];
  seoTitle?: string | null;
  seoDescription?: string | null;
  /** Option axes, e.g. [{ name: 'Size', values: ['S','M'] }, { name: 'Colour', values: ['Black'] }] */
  options: Array<{ name: string; values: string[] }>;
  variants: Array<{
    id?: string | null;
    optionValues: Array<{ optionName: string; name: string }>;
    price: string;
    compareAtPrice: string | null;
    sku: string | null;
    barcode: string | null;
    weightGrams: number | null;
  }>;
  /** New images by URL (already uploaded to Shopify or publicly reachable). */
  newMedia: Array<{ url: string; alt: string }>;
  /** Brand-authored garment facts shown in the PDP accordions. */
  facts: { fit: string | null; fabric: string | null; care: string | null; sizeGuide: string | null };
}

/**
 * Creates or updates a product with `productSet`, Shopify's idempotent
 * "make the product look like this" mutation. Variants not listed are removed by
 * Shopify, so the editor always sends the full variant set it displays.
 */
export async function saveProduct(input: ProductWriteInput): Promise<{ id: string; handle: string }> {
  const metafields = (
    [
      ['fit', input.facts.fit],
      ['fabric', input.facts.fabric],
      ['care', input.facts.care],
      ['size_guide', input.facts.sizeGuide],
    ] as const
  )
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => ({ namespace: 'infnity', key, type: 'multi_line_text_field', value: value ?? '' }));

  const data = await adminRequest<{
    productSet: { product: { id: string; handle: string } | null; userErrors: Array<{ field: string[] | null; message: string; code: string | null }> };
  }>(
    /* GraphQL */ `
      mutation SaveProduct($input: ProductSetInput!) {
        productSet(input: $input, synchronous: true) {
          product { id handle }
          userErrors { field message code }
        }
      }
    `,
    {
      input: {
        ...(input.id ? { id: toGid('Product', input.id) } : {}),
        title: input.title,
        ...(input.handle ? { handle: input.handle } : {}),
        descriptionHtml: input.descriptionHtml,
        productType: input.productType,
        vendor: input.vendor,
        status: input.status,
        tags: input.tags,
        seo: { title: input.seoTitle ?? null, description: input.seoDescription ?? null },
        productOptions: input.options.map((option, index) => ({
          name: option.name,
          position: index + 1,
          values: option.values.map((name) => ({ name })),
        })),
        variants: input.variants.map((variant, index) => ({
          ...(variant.id ? { id: toGid('ProductVariant', variant.id) } : {}),
          position: index + 1,
          optionValues: variant.optionValues,
          price: variant.price,
          compareAtPrice: variant.compareAtPrice,
          sku: variant.sku,
          barcode: variant.barcode,
          inventoryItem: {
            tracked: true,
            ...(variant.weightGrams ? { measurement: { weight: { value: variant.weightGrams, unit: 'GRAMS' } } } : {}),
          },
        })),
        ...(input.newMedia.length
          ? { files: input.newMedia.map((media) => ({ originalSource: media.url, alt: media.alt, contentType: 'IMAGE' })) }
          : {}),
        ...(metafields.length ? { metafields } : {}),
      },
    },
  );
  assertNoUserErrors(data.productSet, 'Saving the product');
  if (!data.productSet.product) throw new ShopifyApiError('Shopify did not return the saved product', 'graphql');
  return data.productSet.product;
}

export async function duplicateProduct(id: string, newTitle: string): Promise<{ id: string } | null> {
  const data = await adminRequest<{
    productDuplicate: { newProduct: { id: string } | null; userErrors: Array<{ field: string[] | null; message: string }> };
  }>(
    /* GraphQL */ `
      mutation Duplicate($id: ID!, $title: String!) {
        productDuplicate(productId: $id, newTitle: $title, newStatus: DRAFT) {
          newProduct { id }
          userErrors { field message }
        }
      }
    `,
    { id: toGid('Product', id), title: newTitle },
  );
  assertNoUserErrors(data.productDuplicate, 'Duplicating the product');
  return data.productDuplicate.newProduct;
}

/** Publishes or unpublishes a product on the given sales channels (Online Store, Headless…). */
export async function setPublished(productId: string, publicationIds: string[], publish: boolean): Promise<void> {
  if (publicationIds.length === 0) return;
  const mutation = publish ? 'publishablePublish' : 'publishableUnpublish';
  const data = await adminRequest<Record<string, { userErrors: Array<{ field: string[] | null; message: string }> }>>(
    /* GraphQL */ `
      mutation Publish($id: ID!, $input: [PublicationInput!]!) {
        ${mutation}(id: $id, input: $input) { userErrors { field message } }
      }
    `,
    { id: toGid('Product', productId), input: publicationIds.map((publicationId) => ({ publicationId })) },
  );
  assertNoUserErrors(data[mutation], publish ? 'Publishing' : 'Unpublishing');
}

/**
 * Uploads an image to Shopify's CDN through a staged upload and returns the
 * `resourceUrl` to attach to a product or use in the CMS.
 */
export async function uploadImage(file: { name: string; type: string; size: number; bytes: ArrayBuffer }): Promise<string> {
  const data = await adminRequest<{
    stagedUploadsCreate: {
      stagedTargets: Array<{ url: string; resourceUrl: string; parameters: Array<{ name: string; value: string }> }>;
      userErrors: Array<{ field: string[] | null; message: string }>;
    };
  }>(
    /* GraphQL */ `
      mutation Stage($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets { url resourceUrl parameters { name value } }
          userErrors { field message }
        }
      }
    `,
    { input: [{ resource: 'IMAGE', filename: file.name, mimeType: file.type, httpMethod: 'POST', fileSize: String(file.size) }] },
  );
  assertNoUserErrors(data.stagedUploadsCreate, 'Preparing the upload');
  const target = data.stagedUploadsCreate.stagedTargets[0];
  if (!target) throw new ShopifyApiError('Shopify returned no upload target', 'graphql');
  const form = new FormData();
  for (const parameter of target.parameters) form.append(parameter.name, parameter.value);
  form.append('file', new Blob([file.bytes], { type: file.type }), file.name);
  const response = await fetch(target.url, { method: 'POST', body: form, signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new ShopifyApiError(`Image upload failed (${response.status})`, 'http', response.status);
  return target.resourceUrl;
}

/* ------------------------------------------------------------------ *
 * Inventory
 * ------------------------------------------------------------------ */

/**
 * Sets an absolute "available" quantity with compare-and-set: Shopify rejects
 * the write if the quantity changed since the operator loaded the screen
 * (`changeFromQuantity`), so two people — or a sale landing mid-edit — cannot
 * silently overwrite each other or double-decrement stock.
 */
export async function setAvailableQuantity(input: {
  inventoryItemId: string;
  locationId: string;
  expectedCurrent: number;
  quantity: number;
  reason: 'correction' | 'received' | 'damaged' | 'restock' | 'cycle_count_available';
  referenceDocumentUri: string;
}): Promise<void> {
  const data = await adminRequest<{
    inventorySetQuantities: { userErrors: Array<{ field: string[] | null; message: string; code: string | null }> };
  }>(
    /* GraphQL */ `
      mutation SetQuantity($input: InventorySetQuantitiesInput!) {
        inventorySetQuantities(input: $input) { userErrors { field message code } }
      }
    `,
    {
      input: {
        name: 'available',
        reason: input.reason,
        referenceDocumentUri: input.referenceDocumentUri,
        quantities: [
          {
            inventoryItemId: input.inventoryItemId,
            locationId: input.locationId,
            quantity: input.quantity,
            changeFromQuantity: input.expectedCurrent,
          },
        ],
      },
    },
  );
  assertNoUserErrors(data.inventorySetQuantities, 'Updating stock');
}

/* ------------------------------------------------------------------ *
 * Orders
 * ------------------------------------------------------------------ */

export interface AdminOrderSummary {
  id: string;
  name: string;
  processedAt: string;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  cancelledAt: string | null;
  total: MoneyNode;
  customerName: string | null;
  email: string | null;
  test: boolean;
  itemCount: number;
}

export async function listOrders(search: string | null, after: string | null = null) {
  const data = await adminRequest<{
    orders: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: Array<{
        id: string;
        name: string;
        processedAt: string;
        displayFinancialStatus: string | null;
        displayFulfillmentStatus: string | null;
        cancelledAt: string | null;
        test: boolean;
        email: string | null;
        currentSubtotalLineItemsQuantity: number;
        totalPriceSet: { shopMoney: MoneyNode };
        customer: { displayName: string } | null;
      }>;
    };
  }>(
    /* GraphQL */ `
      query AdminOrders($query: String, $after: String) {
        orders(first: 50, after: $after, query: $query, sortKey: PROCESSED_AT, reverse: true) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id name processedAt displayFinancialStatus displayFulfillmentStatus cancelledAt test email
            currentSubtotalLineItemsQuantity
            totalPriceSet { shopMoney { amount currencyCode } }
            customer { displayName }
          }
        }
      }
    `,
    { query: search || null, after },
  );
  return {
    pageInfo: data.orders.pageInfo,
    orders: data.orders.nodes.map(
      (node): AdminOrderSummary => ({
        id: node.id,
        name: node.name,
        processedAt: node.processedAt,
        financialStatus: node.displayFinancialStatus,
        fulfillmentStatus: node.displayFulfillmentStatus,
        cancelledAt: node.cancelledAt,
        total: node.totalPriceSet.shopMoney,
        customerName: node.customer?.displayName ?? null,
        email: node.email,
        test: node.test,
        itemCount: node.currentSubtotalLineItemsQuantity,
      }),
    ),
  };
}

export async function getOrder(id: string) {
  const data = await adminRequest<{
    order: {
      id: string;
      name: string;
      processedAt: string;
      cancelledAt: string | null;
      cancelReason: string | null;
      displayFinancialStatus: string | null;
      displayFulfillmentStatus: string | null;
      test: boolean;
      note: string | null;
      tags: string[];
      email: string | null;
      customer: { id: string; displayName: string } | null;
      shippingAddress: { formatted: string[] } | null;
      subtotalPriceSet: { shopMoney: MoneyNode };
      totalShippingPriceSet: { shopMoney: MoneyNode };
      totalTaxSet: { shopMoney: MoneyNode };
      totalDiscountsSet: { shopMoney: MoneyNode };
      totalPriceSet: { shopMoney: MoneyNode };
      totalRefundedSet: { shopMoney: MoneyNode };
      discountCodes: string[];
      lineItems: {
        nodes: Array<{
          id: string;
          title: string;
          variantTitle: string | null;
          sku: string | null;
          quantity: number;
          unfulfilledQuantity: number;
          originalUnitPriceSet: { shopMoney: MoneyNode };
          discountedTotalSet: { shopMoney: MoneyNode };
          image: { url: string } | null;
        }>;
      };
      fulfillmentOrders: { nodes: Array<{ id: string; status: string; supportedActions: Array<{ action: string }> }> };
      fulfillments: Array<{
        id: string;
        status: string;
        displayStatus: string | null;
        createdAt: string;
        trackingInfo: Array<{ company: string | null; number: string | null; url: string | null }>;
      }>;
      events: { nodes: Array<{ id: string; createdAt: string; message: string }> };
    } | null;
  }>(
    /* GraphQL */ `
      query AdminOrder($id: ID!) {
        order(id: $id) {
          id name processedAt cancelledAt cancelReason displayFinancialStatus displayFulfillmentStatus test note tags email
          customer { id displayName }
          shippingAddress { formatted(withName: true) }
          subtotalPriceSet { shopMoney { amount currencyCode } }
          totalShippingPriceSet { shopMoney { amount currencyCode } }
          totalTaxSet { shopMoney { amount currencyCode } }
          totalDiscountsSet { shopMoney { amount currencyCode } }
          totalPriceSet { shopMoney { amount currencyCode } }
          totalRefundedSet { shopMoney { amount currencyCode } }
          discountCodes
          lineItems(first: 100) {
            nodes {
              id title variantTitle sku quantity unfulfilledQuantity
              originalUnitPriceSet { shopMoney { amount currencyCode } }
              discountedTotalSet { shopMoney { amount currencyCode } }
              image { url }
            }
          }
          fulfillmentOrders(first: 10) { nodes { id status supportedActions { action } } }
          fulfillments(first: 10) { id status displayStatus createdAt trackingInfo(first: 5) { company number url } }
          events(first: 30, sortKey: CREATED_AT, reverse: true) { nodes { id createdAt message } }
        }
      }
    `,
    { id: toGid('Order', id) },
  );
  return data.order;
}

export async function updateOrderNoteAndTags(id: string, note: string | null, tags: string[]): Promise<void> {
  const data = await adminRequest<{ orderUpdate: { userErrors: Array<{ field: string[] | null; message: string }> } }>(
    /* GraphQL */ `
      mutation UpdateOrder($input: OrderInput!) {
        orderUpdate(input: $input) { userErrors { field message } }
      }
    `,
    { input: { id: toGid('Order', id), note, tags } },
  );
  assertNoUserErrors(data.orderUpdate, 'Updating the order');
}

/** Fulfils every open fulfilment order with tracking; Shopify emails the customer when asked to. */
export async function fulfillOrder(input: {
  fulfillmentOrderIds: string[];
  tracking: { company: string | null; number: string | null; url: string | null };
  notifyCustomer: boolean;
}): Promise<string> {
  const data = await adminRequest<{
    fulfillmentCreate: { fulfillment: { id: string } | null; userErrors: Array<{ field: string[] | null; message: string }> };
  }>(
    /* GraphQL */ `
      mutation Fulfil($fulfillment: FulfillmentInput!) {
        fulfillmentCreate(fulfillment: $fulfillment) {
          fulfillment { id }
          userErrors { field message }
        }
      }
    `,
    {
      fulfillment: {
        lineItemsByFulfillmentOrder: input.fulfillmentOrderIds.map((fulfillmentOrderId) => ({ fulfillmentOrderId })),
        notifyCustomer: input.notifyCustomer,
        trackingInfo: {
          company: input.tracking.company,
          number: input.tracking.number,
          url: input.tracking.url,
        },
      },
    },
  );
  assertNoUserErrors(data.fulfillmentCreate, 'Fulfilling the order');
  if (!data.fulfillmentCreate.fulfillment) throw new ShopifyApiError('Shopify did not return a fulfilment', 'graphql');
  return data.fulfillmentCreate.fulfillment.id;
}

/* ------------------------------------------------------------------ *
 * Customers
 * ------------------------------------------------------------------ */

export interface AdminCustomerSummary {
  id: string;
  displayName: string;
  email: string | null;
  marketingState: string | null;
  numberOfOrders: number;
  amountSpent: MoneyNode | null;
  lastOrderAt: string | null;
  tags: string[];
  createdAt: string;
}

export async function listCustomers(search: string | null, after: string | null = null) {
  const data = await adminRequest<{
    customers: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: Array<{
        id: string;
        displayName: string;
        createdAt: string;
        tags: string[];
        numberOfOrders: string;
        amountSpent: MoneyNode | null;
        lastOrder: { processedAt: string } | null;
        defaultEmailAddress: { emailAddress: string; marketingState: string } | null;
      }>;
    };
  }>(
    /* GraphQL */ `
      query AdminCustomers($query: String, $after: String) {
        customers(first: 50, after: $after, query: $query, sortKey: UPDATED_AT, reverse: true) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id displayName createdAt tags numberOfOrders
            amountSpent { amount currencyCode }
            lastOrder { processedAt }
            defaultEmailAddress { emailAddress marketingState }
          }
        }
      }
    `,
    { query: search || null, after },
  );
  return {
    pageInfo: data.customers.pageInfo,
    customers: data.customers.nodes.map(
      (node): AdminCustomerSummary => ({
        id: node.id,
        displayName: node.displayName,
        email: node.defaultEmailAddress?.emailAddress ?? null,
        marketingState: node.defaultEmailAddress?.marketingState ?? null,
        numberOfOrders: Number(node.numberOfOrders),
        amountSpent: node.amountSpent,
        lastOrderAt: node.lastOrder?.processedAt ?? null,
        tags: node.tags,
        createdAt: node.createdAt,
      }),
    ),
  };
}

export async function getCustomer(id: string) {
  const data = await adminRequest<{
    customer: {
      id: string;
      displayName: string;
      note: string | null;
      tags: string[];
      createdAt: string;
      numberOfOrders: string;
      amountSpent: MoneyNode | null;
      defaultEmailAddress: { emailAddress: string; marketingState: string; marketingUpdatedAt: string | null } | null;
      defaultPhoneNumber: { phoneNumber: string } | null;
      defaultAddress: { formatted: string[] } | null;
      orders: { nodes: Array<{ id: string; name: string; processedAt: string; displayFinancialStatus: string | null; displayFulfillmentStatus: string | null; totalPriceSet: { shopMoney: MoneyNode } }> };
    } | null;
  }>(
    /* GraphQL */ `
      query AdminCustomer($id: ID!) {
        customer(id: $id) {
          id displayName note tags createdAt numberOfOrders
          amountSpent { amount currencyCode }
          defaultEmailAddress { emailAddress marketingState marketingUpdatedAt }
          defaultPhoneNumber { phoneNumber }
          defaultAddress { formatted }
          orders(first: 25, sortKey: PROCESSED_AT, reverse: true) {
            nodes { id name processedAt displayFinancialStatus displayFulfillmentStatus totalPriceSet { shopMoney { amount currencyCode } } }
          }
        }
      }
    `,
    { id: toGid('Customer', id) },
  );
  return data.customer;
}

export async function updateCustomerNoteAndTags(id: string, note: string | null, tags: string[]): Promise<void> {
  const data = await adminRequest<{ customerUpdate: { userErrors: Array<{ field: string[] | null; message: string }> } }>(
    /* GraphQL */ `
      mutation UpdateCustomer($input: CustomerInput!) {
        customerUpdate(input: $input) { userErrors { field message } }
      }
    `,
    { input: { id: toGid('Customer', id), note, tags } },
  );
  assertNoUserErrors(data.customerUpdate, 'Updating the customer');
}

/* ------------------------------------------------------------------ *
 * Discounts
 * ------------------------------------------------------------------ */

export async function resolveProductIdsByHandle(handles: readonly string[]): Promise<string[]> {
  if (handles.length === 0) return [];
  const query = handles.map((handle) => `handle:${JSON.stringify(handle)}`).join(' OR ');
  const data = await adminRequest<{ products: { nodes: Array<{ id: string; handle: string }> } }>(
    /* GraphQL */ `query Handles($query: String!) { products(first: 100, query: $query) { nodes { id handle } } }`,
    { query },
  );
  const byHandle = new Map(data.products.nodes.map((node) => [node.handle, node.id]));
  const missing = handles.filter((handle) => !byHandle.has(handle));
  if (missing.length) throw new ShopifyApiError(`Unknown product handle(s): ${missing.join(', ')}`, 'user');
  return handles.map((handle) => byHandle.get(handle)!);
}

/** Creates the "customers with no orders" segment used by first-order offers. */
export async function ensureFirstOrderSegment(): Promise<string> {
  const name = 'INFNITY — no orders yet';
  const existing = await adminRequest<{ segments: { nodes: Array<{ id: string; name: string }> } }>(
    /* GraphQL */ `query Segments { segments(first: 100) { nodes { id name } } }`,
  );
  const found = existing.segments.nodes.find((segment) => segment.name === name);
  if (found) return found.id;
  const data = await adminRequest<{ segmentCreate: { segment: { id: string } | null; userErrors: Array<{ field: string[] | null; message: string }> } }>(
    /* GraphQL */ `
      mutation Segment($name: String!, $query: String!) {
        segmentCreate(name: $name, query: $query) { segment { id } userErrors { field message } }
      }
    `,
    { name, query: 'number_of_orders = 0' },
  );
  assertNoUserErrors(data.segmentCreate, 'Creating the first-order segment');
  return data.segmentCreate.segment!.id;
}

export async function createDiscount(mutation: string, input: Record<string, unknown>): Promise<string> {
  const field = mutation.includes('Code') ? 'codeDiscountNode' : 'automaticDiscountNode';
  const inputName = mutation.includes('Bxgy')
    ? mutation.includes('Code')
      ? 'bxgyCodeDiscount'
      : 'automaticBxgyDiscount'
    : mutation.includes('Code')
      ? 'basicCodeDiscount'
      : 'automaticBasicDiscount';
  const inputType = mutation.includes('Bxgy')
    ? mutation.includes('Code')
      ? 'DiscountCodeBxgyInput'
      : 'DiscountAutomaticBxgyInput'
    : mutation.includes('Code')
      ? 'DiscountCodeBasicInput'
      : 'DiscountAutomaticBasicInput';
  const data = await adminRequest<Record<string, { userErrors: Array<{ field: string[] | null; message: string }> } & Record<string, { id: string } | null>>>(
    /* GraphQL */ `
      mutation CreateDiscount($input: ${inputType}!) {
        ${mutation}(${inputName}: $input) {
          ${field} { id }
          userErrors { field message }
        }
      }
    `,
    { input },
  );
  const payload = data[mutation]!;
  assertNoUserErrors(payload, 'Creating the discount');
  const node = payload[field] as { id: string } | null;
  if (!node) throw new ShopifyApiError('Shopify did not return the discount', 'graphql');
  return node.id;
}

export async function setDiscountActive(discountId: string, active: boolean): Promise<void> {
  const isCode = discountId.includes('DiscountCodeNode');
  const mutation = `discount${isCode ? 'Code' : 'Automatic'}${active ? 'Activate' : 'Deactivate'}`;
  const data = await adminRequest<Record<string, { userErrors: Array<{ field: string[] | null; message: string }> }>>(
    /* GraphQL */ `mutation Toggle($id: ID!) { ${mutation}(id: $id) { userErrors { field message } } }`,
    { id: discountId },
  );
  assertNoUserErrors(data[mutation], active ? 'Activating the discount' : 'Deactivating the discount');
}

export async function listLiveDiscounts() {
  const data = await adminRequest<{
    discountNodes: {
      nodes: Array<{ id: string; discount: { __typename: string; title: string; status: string; startsAt: string; endsAt: string | null; asyncUsageCount?: number } }>;
    };
  }>(/* GraphQL */ `
    query Discounts {
      discountNodes(first: 50, sortKey: CREATED_AT, reverse: true) {
        nodes {
          id
          discount {
            __typename
            ... on DiscountAutomaticBasic { title status startsAt endsAt asyncUsageCount }
            ... on DiscountCodeBasic { title status startsAt endsAt asyncUsageCount }
            ... on DiscountAutomaticBxgy { title status startsAt endsAt asyncUsageCount }
            ... on DiscountCodeBxgy { title status startsAt endsAt asyncUsageCount }
            ... on DiscountCodeFreeShipping { title status startsAt endsAt asyncUsageCount }
            ... on DiscountAutomaticFreeShipping { title status startsAt endsAt asyncUsageCount }
          }
        }
      }
    }
  `);
  return data.discountNodes.nodes;
}

/* ------------------------------------------------------------------ *
 * Marketing consent
 * ------------------------------------------------------------------ */

/** Records newsletter consent on the matching Shopify customer, creating one if needed. */
export async function syncEmailConsent(email: string, subscribed: boolean): Promise<'updated' | 'created'> {
  const found = await adminRequest<{ customers: { nodes: Array<{ id: string }> } }>(
    /* GraphQL */ `query Find($query: String!) { customers(first: 1, query: $query) { nodes { id } } }`,
    { query: `email:${JSON.stringify(email)}` },
  );
  const consent = {
    marketingState: subscribed ? 'SUBSCRIBED' : 'UNSUBSCRIBED',
    marketingOptInLevel: 'CONFIRMED_OPT_IN',
    consentUpdatedAt: new Date().toISOString(),
  };
  const existing = found.customers.nodes[0];
  if (existing) {
    const data = await adminRequest<{ customerEmailMarketingConsentUpdate: { userErrors: Array<{ field: string[] | null; message: string }> } }>(
      /* GraphQL */ `
        mutation Consent($input: CustomerEmailMarketingConsentUpdateInput!) {
          customerEmailMarketingConsentUpdate(input: $input) { userErrors { field message } }
        }
      `,
      { input: { customerId: existing.id, emailMarketingConsent: consent } },
    );
    assertNoUserErrors(data.customerEmailMarketingConsentUpdate, 'Updating marketing consent');
    return 'updated';
  }
  const data = await adminRequest<{ customerCreate: { userErrors: Array<{ field: string[] | null; message: string }> } }>(
    /* GraphQL */ `
      mutation Create($input: CustomerInput!) { customerCreate(input: $input) { userErrors { field message } } }
    `,
    { input: { email, emailMarketingConsent: consent, tags: ['newsletter'] } },
  );
  assertNoUserErrors(data.customerCreate, 'Creating the subscriber');
  return 'created';
}

/* ------------------------------------------------------------------ *
 * Analytics (orders-based; no session data is fabricated)
 * ------------------------------------------------------------------ */

export async function salesSummary(sinceIso: string) {
  const orders: Array<{
    processedAt: string;
    test: boolean;
    cancelledAt: string | null;
    displayFinancialStatus: string | null;
    displayFulfillmentStatus: string | null;
    totalPriceSet: { shopMoney: MoneyNode };
    totalRefundedSet: { shopMoney: MoneyNode };
    discountCodes: string[];
    lineItems: { nodes: Array<{ title: string; sku: string | null; quantity: number; discountedTotalSet: { shopMoney: MoneyNode } }> };
  }> = [];
  let after: string | null = null;
  for (let page = 0; page < 5; page += 1) {
    const data: {
      orders: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: typeof orders;
      };
    } = await adminRequest(
      /* GraphQL */ `
        query Sales($query: String!, $after: String) {
          orders(first: 100, after: $after, query: $query, sortKey: PROCESSED_AT, reverse: true) {
            pageInfo { hasNextPage endCursor }
            nodes {
              processedAt test cancelledAt displayFinancialStatus displayFulfillmentStatus discountCodes
              totalPriceSet { shopMoney { amount currencyCode } }
              totalRefundedSet { shopMoney { amount currencyCode } }
              lineItems(first: 50) { nodes { title sku quantity discountedTotalSet { shopMoney { amount currencyCode } } } }
            }
          }
        }
      `,
      { query: `processed_at:>=${sinceIso}`, after },
    );
    orders.push(...data.orders.nodes);
    if (!data.orders.pageInfo.hasNextPage) break;
    after = data.orders.pageInfo.endCursor;
  }
  return orders;
}

/* ------------------------------------------------------------------ *
 * Inventory overview and counts
 * ------------------------------------------------------------------ */

export interface InventoryRow {
  variantId: string;
  variantTitle: string;
  sku: string | null;
  productId: string;
  productTitle: string;
  productHandle: string;
  inventoryItemId: string;
  tracked: boolean;
  levels: Array<{ locationId: string; locationName: string; available: number; committed: number; onHand: number; reserved: number; incoming: number }>;
}

export async function listInventory(search: string | null, after: string | null = null) {
  const data = await adminRequest<{
    productVariants: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: Array<{
        id: string;
        title: string;
        sku: string | null;
        product: { id: string; title: string; handle: string };
        inventoryItem: {
          id: string;
          tracked: boolean;
          inventoryLevels: { nodes: Array<{ location: { id: string; name: string }; quantities: Array<{ name: string; quantity: number }> }> };
        };
      }>;
    };
  }>(
    /* GraphQL */ `
      query Inventory($query: String, $after: String) {
        productVariants(first: 100, after: $after, query: $query) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id title sku
            product { id title handle }
            inventoryItem {
              id tracked
              inventoryLevels(first: 10) {
                nodes {
                  location { id name }
                  quantities(names: ["available", "committed", "on_hand", "reserved", "incoming"]) { name quantity }
                }
              }
            }
          }
        }
      }
    `,
    { query: search || null, after },
  );
  return {
    pageInfo: data.productVariants.pageInfo,
    rows: data.productVariants.nodes.map(
      (node): InventoryRow => ({
        variantId: node.id,
        variantTitle: node.title,
        sku: node.sku,
        productId: node.product.id,
        productTitle: node.product.title,
        productHandle: node.product.handle,
        inventoryItemId: node.inventoryItem.id,
        tracked: node.inventoryItem.tracked,
        levels: node.inventoryItem.inventoryLevels.nodes.map((level) => {
          const q = (name: string) => level.quantities.find((entry) => entry.name === name)?.quantity ?? 0;
          return {
            locationId: level.location.id,
            locationName: level.location.name,
            available: q('available'),
            committed: q('committed'),
            onHand: q('on_hand'),
            reserved: q('reserved'),
            incoming: q('incoming'),
          };
        }),
      }),
    ),
  };
}

export async function countOrders(query: string): Promise<number> {
  const data = await adminRequest<{ ordersCount: { count: number } }>(
    /* GraphQL */ `query Count($query: String) { ordersCount(query: $query) { count } }`,
    { query },
  );
  return data.ordersCount.count;
}

/** Adds tags to an order (used to record a cancellation/refund *request* for the owner). */
export async function addOrderTags(id: string, tags: string[]): Promise<void> {
  const data = await adminRequest<{ tagsAdd: { userErrors: Array<{ field: string[] | null; message: string }> } }>(
    /* GraphQL */ `mutation Tag($id: ID!, $tags: [String!]!) { tagsAdd(id: $id, tags: $tags) { userErrors { field message } } }`,
    { id: toGid('Order', id), tags },
  );
  assertNoUserErrors(data.tagsAdd, 'Tagging the order');
}
