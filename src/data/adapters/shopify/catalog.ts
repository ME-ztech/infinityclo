/**
 * Live catalogue — Shopify Storefront API over the committed snapshot.
 *
 * Shopify is the system of record for the catalogue. This adapter reads it live
 * (cached for a minute) so price, per-variant availability, new products and
 * unpublished products reach the storefront without a deployment.
 *
 * The committed snapshot still earns its place:
 *
 *   - **Fallback.** If Shopify cannot be reached the storefront serves the
 *     snapshot rather than an error page. Shopify checkout remains the final
 *     authority on stock either way, so a stale "in stock" can never become a
 *     wrongly accepted order.
 *   - **Localised imagery.** A live image whose source matches a file already
 *     in `public/products/` is served from this origin.
 *   - **Extracted facts.** Fabric weight, model info and similar details the
 *     importer read out of the brand's own copy are carried over.
 *
 * Only public catalogue fields are requested, so this works in the Storefront
 * API's tokenless mode and needs no credential.
 */
import 'server-only';

import { cache } from 'react';

import { htmlToText } from '@/domain/text';
import type { Collection, Money, Product, ProductMedia, ProductVariant } from '@/domain/types';
import { config } from '@/server/config';
import { fromGid, storefrontQuery } from '@/server/shopify/client';

import { ArrayCatalogRepository, type CatalogData } from '../local/catalog';
import { collections as snapshotCollections, products as snapshotProducts } from '../local/snapshot';

const PAGE_SIZE = 20;
const MAX_PAGES = 15;
export const CATALOG_REVALIDATE_SECONDS = 60;
export const CATALOG_TAG = 'catalog';

const PRODUCTS_QUERY = /* GraphQL */ `
  query LiveCatalog($first: Int!, $after: String) {
    products(first: $first, after: $after, sortKey: CREATED_AT, reverse: true) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        handle
        title
        descriptionHtml
        productType
        tags
        publishedAt
        options { name values }
        images(first: 12) { nodes { id url altText width height } }
        variants(first: 40) {
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
      }
    }
  }
`;

interface LiveMoney {
  amount: string;
  currencyCode: string;
}

interface LiveProduct {
  id: string;
  handle: string;
  title: string;
  descriptionHtml: string | null;
  productType: string | null;
  tags: string[];
  publishedAt: string | null;
  options: Array<{ name: string; values: string[] }>;
  images: { nodes: Array<{ id: string; url: string; altText: string | null; width: number | null; height: number | null }> };
  variants: {
    nodes: Array<{
      id: string;
      title: string;
      sku: string | null;
      availableForSale: boolean;
      price: LiveMoney;
      compareAtPrice: LiveMoney | null;
      selectedOptions: Array<{ name: string; value: string }>;
      image: { id: string } | null;
    }>;
  };
}

interface LiveCatalogResponse {
  products: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: LiveProduct[] };
}

const toMoney = (value: LiveMoney): Money => ({
  amount: Math.round(Number(value.amount) * 100),
  currency: value.currencyCode === 'USD' ? 'USD' : 'CAD',
});

/** `…/files/SUM-1.jpg?v=1` and `…/files/SUM-1_800x.jpg` identify the same asset. */
const assetKey = (url: string): string =>
  (url.split('?')[0] ?? url).replace(/_(\d+x\d+|\d+x|x\d+)(\.[a-z]+)$/i, '$2').split('/').pop() ?? url;

/** Shopify's default single-option placeholder is not a real choice. */
const isPlaceholderOption = (option: { name: string; values: string[] }): boolean =>
  option.name === 'Title' && option.values.length === 1 && option.values[0] === 'Default Title';

export function mapLiveProduct(live: LiveProduct, snapshot: Product | undefined): Product {
  const localMedia = new Map(
    (snapshot?.media ?? []).filter((media) => media.sourceUrl).map((media) => [assetKey(media.sourceUrl!), media]),
  );

  const mediaIdByImage = new Map<string, string>();
  const media: ProductMedia[] = live.images.nodes.map((image, index) => {
    const local = localMedia.get(assetKey(image.url));
    const id = local?.id ?? `${live.handle}-media-${index + 1}`;
    mediaIdByImage.set(image.id, id);
    return {
      id,
      url: local?.url ?? image.url,
      alt: image.altText?.trim() || local?.alt || `${live.title} — view ${index + 1}`,
      kind: local?.kind ?? (index === 0 ? 'product' : 'detail'),
      width: local?.width ?? image.width ?? 1600,
      height: local?.height ?? image.height ?? 1600,
      position: index + 1,
      sourceUrl: image.url,
      blurDataUrl: local?.blurDataUrl ?? null,
    };
  });

  const options = live.options.filter((option) => !isPlaceholderOption(option));

  const variants: ProductVariant[] = live.variants.nodes.map((variant) => {
    const price = toMoney(variant.price);
    const compareAt = variant.compareAtPrice ? toMoney(variant.compareAtPrice) : null;
    return {
      id: fromGid(variant.id),
      sku: variant.sku?.trim() || null,
      title: variant.title === 'Default Title' ? live.title : variant.title,
      price,
      // A compare-at price is only a "was" price when it is genuinely higher.
      compareAtPrice: compareAt && compareAt.amount > price.amount ? compareAt : null,
      availability: variant.availableForSale ? 'in_stock' : 'sold_out',
      selectedOptions: Object.fromEntries(
        variant.selectedOptions
          .filter((selected) => options.some((option) => option.name === selected.name))
          .map((selected) => [selected.name, selected.value]),
      ),
      mediaId: variant.image ? (mediaIdByImage.get(variant.image.id) ?? null) : null,
    };
  });

  return {
    id: fromGid(live.id),
    slug: live.handle,
    name: live.title,
    tagline: snapshot?.tagline ?? null,
    description: htmlToText(live.descriptionHtml) ?? null,
    category: live.productType?.trim() || null,
    collectionSlugs: snapshot?.collectionSlugs ?? [],
    options: options.map((option, index) => ({
      id: `${live.handle}-option-${index}`,
      name: option.name,
      position: index + 1,
      values: option.values,
    })),
    variants,
    media,
    specification: snapshot?.specification ?? {
      materials: null,
      fit: null,
      care: null,
      construction: null,
      weightGsm: null,
      countryOfOrigin: null,
      modelInfo: null,
    },
    tags: live.tags,
    sizeGuideId: snapshot?.sizeGuideId ?? null,
    publishedAt: live.publishedAt,
    legacyUrl: snapshot?.legacyUrl ?? null,
    featuredRank: snapshot?.featuredRank ?? null,
  };
}

async function fetchLiveProducts(): Promise<Product[]> {
  const bySlug = new Map(snapshotProducts.map((product) => [product.slug, product]));
  const products: Product[] = [];
  let after: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const data: LiveCatalogResponse = await storefrontQuery<LiveCatalogResponse>(PRODUCTS_QUERY, {
      variables: { first: PAGE_SIZE, after },
      revalidate: CATALOG_REVALIDATE_SECONDS,
      tags: [CATALOG_TAG],
      maxAttempts: 2,
    });
    for (const node of data.products.nodes) products.push(mapLiveProduct(node, bySlug.get(node.handle)));
    if (!data.products.pageInfo.hasNextPage) break;
    after = data.products.pageInfo.endCursor;
  }
  return products;
}

export type CatalogOrigin = 'shopify-live' | 'snapshot';

let lastOrigin: CatalogOrigin = 'snapshot';
let lastGood: { at: number; products: Product[] } | null = null;

/** Which source served the most recent catalogue read. Shown in admin. */
export function catalogOrigin(): CatalogOrigin {
  return lastOrigin;
}

/**
 * One catalogue read per request (`cache`), one Shopify fetch per minute
 * (`revalidate`). Failure falls back to the last good live read, then to the
 * committed snapshot.
 */
const loadCatalog = cache(async (): Promise<CatalogData> => {
  const collections: readonly Collection[] = snapshotCollections;
  if (!config.shopify.liveCatalog) {
    lastOrigin = 'snapshot';
    return { products: snapshotProducts, collections };
  }
  try {
    const products = await fetchLiveProducts();
    if (products.length === 0) throw new Error('Shopify returned an empty catalogue.');
    lastGood = { at: Date.now(), products };
    lastOrigin = 'shopify-live';
    return { products, collections };
  } catch (error) {
    console.warn(`[catalog] live read failed, serving fallback: ${(error as Error).message}`);
    if (lastGood) {
      lastOrigin = 'shopify-live';
      return { products: lastGood.products, collections };
    }
    lastOrigin = 'snapshot';
    return { products: snapshotProducts, collections };
  }
});

export const shopifyCatalogRepository = new ArrayCatalogRepository(loadCatalog);
