import 'server-only';

import { extractSpecification, htmlToText } from '@/domain/product-copy';
import type {
  Collection,
  CurrencyCode,
  Money,
  Product,
  ProductMedia,
  ProductVariant,
} from '@/domain/types';

import { shopifyConfig } from './config';
import { assertNoUserErrors, legacyId, shopifyGraphql, ShopifyApiError, toGid } from './graphql';

/* ------------------------------------------------------------------ *
 * Transport
 * ------------------------------------------------------------------ */

export async function storefrontRequest<T>(query: string, variables?: Record<string, unknown>, buyerIp?: string | null): Promise<T> {
  const config = shopifyConfig();
  if (!config.storefrontToken) {
    throw new ShopifyApiError('The Storefront API is not configured.', 'not_configured');
  }
  const headers: Record<string, string> = config.storefrontTokenIsPrivate
    ? { 'Shopify-Storefront-Private-Token': config.storefrontToken }
    : { 'X-Shopify-Storefront-Access-Token': config.storefrontToken };
  if (config.storefrontTokenIsPrivate && buyerIp) headers['Shopify-Storefront-Buyer-IP'] = buyerIp;
  return shopifyGraphql<T>({
    endpoint: `https://${config.storeDomain}/api/${config.apiVersion}/graphql.json`,
    headers,
    query,
    variables,
  });
}

/* ------------------------------------------------------------------ *
 * Catalogue
 * ------------------------------------------------------------------ */

const PRODUCT_FIELDS = /* GraphQL */ `
  id
  handle
  title
  descriptionHtml
  productType
  tags
  publishedAt
  options { id name optionValues { name } }
  images(first: 20) { nodes { id url altText width height } }
  variants(first: 100) {
    nodes {
      id
      title
      sku
      availableForSale
      price { amount currencyCode }
      compareAtPrice { amount currencyCode }
      selectedOptions { name value }
      image { id }
    }
  }
  collections(first: 20) { nodes { handle } }
  fit: metafield(namespace: "infnity", key: "fit") { value }
  fabric: metafield(namespace: "infnity", key: "fabric") { value }
  care: metafield(namespace: "infnity", key: "care") { value }
  sizeGuide: metafield(namespace: "infnity", key: "size_guide") { value }
`;

const PRODUCTS_QUERY = /* GraphQL */ `
  query Products($cursor: String, $country: CountryCode) @inContext(country: $country) {
    products(first: 100, after: $cursor, sortKey: COLLECTION_DEFAULT) {
      pageInfo { hasNextPage endCursor }
      nodes { ${PRODUCT_FIELDS} }
    }
  }
`;

const COLLECTIONS_QUERY = /* GraphQL */ `
  query Collections($country: CountryCode) @inContext(country: $country) {
    collections(first: 50) {
      nodes {
        handle
        title
        descriptionHtml
        image { url altText width height }
        products(first: 250) { nodes { handle } }
      }
    }
  }
`;

export interface StorefrontProductNode {
  id: string;
  handle: string;
  title: string;
  descriptionHtml: string | null;
  productType: string | null;
  tags: string[];
  publishedAt: string | null;
  options: Array<{ id: string; name: string; optionValues: Array<{ name: string }> }>;
  images: { nodes: Array<{ id: string; url: string; altText: string | null; width: number | null; height: number | null }> };
  variants: {
    nodes: Array<{
      id: string;
      title: string;
      sku: string | null;
      availableForSale: boolean;
      price: { amount: string; currencyCode: string };
      compareAtPrice: { amount: string; currencyCode: string } | null;
      selectedOptions: Array<{ name: string; value: string }>;
      image: { id: string } | null;
    }>;
  };
  collections: { nodes: Array<{ handle: string }> };
  fit?: { value: string } | null;
  fabric?: { value: string } | null;
  care?: { value: string } | null;
  sizeGuide?: { value: string } | null;
}

function money(value: { amount: string; currencyCode: string } | null | undefined): Money | null {
  if (!value) return null;
  const amount = Math.round(Number.parseFloat(value.amount) * 100);
  if (!Number.isFinite(amount)) return null;
  return { amount, currency: (value.currencyCode as CurrencyCode) ?? 'CAD' };
}

/** Maps a Storefront API product onto the storefront's domain model. Pure; unit-tested. */
export function mapStorefrontProduct(node: StorefrontProductNode, featuredRank: number | null): Product {
  const slug = node.handle;
  const media: ProductMedia[] = node.images.nodes.map((image, index) => ({
    id: `${slug}-media-${index + 1}`,
    url: image.url.split('?')[0] ?? image.url,
    alt: image.altText?.trim() || (index === 0 ? `${node.title} — INFNITY` : `${node.title} — INFNITY, view ${index + 1}`),
    kind: index === 0 ? 'product' : 'model',
    width: image.width ?? 1600,
    height: image.height ?? 1600,
    position: index + 1,
    sourceUrl: image.url,
  }));
  const mediaIdByImageId = new Map(node.images.nodes.map((image, index) => [image.id, media[index]!.id]));

  const variants: ProductVariant[] = node.variants.nodes.map((variant) => ({
    id: legacyId(variant.id),
    sku: variant.sku?.trim() || null,
    title: variant.title,
    price: money(variant.price) ?? { amount: 0, currency: 'CAD' },
    compareAtPrice: money(variant.compareAtPrice),
    availability: variant.availableForSale ? 'in_stock' : 'sold_out',
    selectedOptions: Object.fromEntries(variant.selectedOptions.map((option) => [option.name, option.value])),
    mediaId: variant.image ? (mediaIdByImageId.get(variant.image.id) ?? null) : null,
  }));

  const description = htmlToText(node.descriptionHtml);
  const { spec } = extractSpecification(description);
  // Brand-authored metafields, when present, take precedence over parsed copy.
  const specification = {
    ...spec,
    fit: node.fit?.value?.trim() || spec.fit,
    materials: node.fabric?.value?.trim() || spec.materials,
    care: node.care?.value?.trim() || spec.care,
  };

  return {
    id: legacyId(node.id),
    slug,
    name: node.title,
    tagline: null,
    description,
    category: node.productType?.trim() || null,
    collectionSlugs: node.collections.nodes.map((collection) => collection.handle),
    options: node.options.map((option, index) => ({
      id: `${slug}-option-${index}`,
      name: option.name,
      position: index + 1,
      values: option.optionValues.map((value) => value.name),
    })),
    variants,
    media,
    specification,
    tags: node.tags,
    sizeGuideId: node.sizeGuide?.value?.trim() || null,
    publishedAt: node.publishedAt,
    legacyUrl: null,
    featuredRank,
  };
}

export async function fetchStorefrontCatalog(): Promise<{ products: Product[]; collections: Collection[] }> {
  const country = shopifyConfig().defaultCountry;
  const nodes: StorefrontProductNode[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 10; page += 1) {
    const data: { products: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: StorefrontProductNode[] } } =
      await storefrontRequest(PRODUCTS_QUERY, { cursor, country });
    nodes.push(...data.products.nodes);
    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
  }

  const collectionData = await storefrontRequest<{
    collections: {
      nodes: Array<{
        handle: string;
        title: string;
        descriptionHtml: string | null;
        image: { url: string; altText: string | null; width: number | null; height: number | null } | null;
        products: { nodes: Array<{ handle: string }> };
      }>;
    };
  }>(COLLECTIONS_QUERY, { country });

  const products = nodes.map((node, index) => mapStorefrontProduct(node, index));
  const collections: Collection[] = collectionData.collections.nodes.map((collection) => ({
    slug: collection.handle,
    name: collection.title,
    description: htmlToText(collection.descriptionHtml),
    heroMedia: collection.image
      ? {
          id: `collection-${collection.handle}-hero`,
          url: collection.image.url,
          alt: collection.image.altText ?? `${collection.title} — INFNITY`,
          kind: 'campaign',
          width: collection.image.width ?? 1600,
          height: collection.image.height ?? 900,
          position: 1,
          sourceUrl: collection.image.url,
        }
      : null,
    dropLabel: null,
    releasedAt: null,
    isArchived: /\b(vault|archive|past)\b/i.test(collection.handle),
    productSlugs: collection.products.nodes.map((product) => product.handle),
    legacyUrl: null,
  }));

  return { products, collections };
}

/* ------------------------------------------------------------------ *
 * Cart → checkout
 * ------------------------------------------------------------------ */

const CART_CREATE = /* GraphQL */ `
  mutation CartCreate($input: CartInput!, $country: CountryCode) @inContext(country: $country) {
    cartCreate(input: $input) {
      cart {
        id
        checkoutUrl
        totalQuantity
        cost { subtotalAmount { amount currencyCode } }
        discountCodes { code applicable }
      }
      userErrors { field message code }
      warnings { code message }
    }
  }
`;

export interface StorefrontCartResult {
  readonly cartId: string;
  readonly checkoutUrl: string;
  readonly totalQuantity: number;
  readonly subtotal: Money | null;
  readonly discountCodes: ReadonlyArray<{ code: string; applicable: boolean }>;
  readonly warnings: readonly string[];
}

export async function createStorefrontCart(input: {
  lines: ReadonlyArray<{ variantId: string; quantity: number }>;
  discountCodes?: readonly string[];
  customerAccessToken?: string | null;
  buyerIp?: string | null;
}): Promise<StorefrontCartResult> {
  const data = await storefrontRequest<{
    cartCreate: {
      cart: {
        id: string;
        checkoutUrl: string;
        totalQuantity: number;
        cost: { subtotalAmount: { amount: string; currencyCode: string } };
        discountCodes: Array<{ code: string; applicable: boolean }>;
      } | null;
      userErrors: Array<{ field: string[] | null; message: string; code: string | null }>;
      warnings: Array<{ code: string; message: string }>;
    };
  }>(
    CART_CREATE,
    {
      country: shopifyConfig().defaultCountry,
      input: {
        lines: input.lines.map((line) => ({ merchandiseId: toGid('ProductVariant', line.variantId), quantity: line.quantity })),
        discountCodes: input.discountCodes ?? [],
        buyerIdentity: {
          countryCode: shopifyConfig().defaultCountry,
          ...(input.customerAccessToken ? { customerAccessToken: input.customerAccessToken } : {}),
        },
      },
    },
    input.buyerIp,
  );
  assertNoUserErrors(data.cartCreate, 'Creating the cart');
  const cart = data.cartCreate.cart;
  if (!cart) throw new ShopifyApiError('Shopify did not return a cart', 'graphql');
  return {
    cartId: cart.id,
    checkoutUrl: cart.checkoutUrl,
    totalQuantity: cart.totalQuantity,
    subtotal: money(cart.cost.subtotalAmount),
    discountCodes: cart.discountCodes,
    warnings: data.cartCreate.warnings.map((warning) => warning.message),
  };
}

/* ------------------------------------------------------------------ *
 * Policies
 * ------------------------------------------------------------------ */

const POLICIES_QUERY = /* GraphQL */ `
  query Policies {
    shop {
      privacyPolicy { handle title body url }
      refundPolicy { handle title body url }
      shippingPolicy { handle title body url }
      termsOfService { handle title body url }
    }
  }
`;

export interface StorefrontPolicy {
  readonly handle: string;
  readonly title: string;
  readonly body: string;
  readonly url: string;
}

export async function fetchStorefrontPolicies(): Promise<StorefrontPolicy[]> {
  const data = await storefrontRequest<{
    shop: Record<string, StorefrontPolicy | StorefrontPolicy[] | null>;
  }>(POLICIES_QUERY);
  return Object.values(data.shop).flatMap((policy) => (policy ? (Array.isArray(policy) ? policy : [policy]) : []));
}
