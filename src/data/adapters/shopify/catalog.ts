import 'server-only';

import { unstable_cache } from 'next/cache';

import { fetchStorefrontCatalog } from '@/server/shopify/storefront';

import { InMemoryCatalogRepository, loadSnapshotCatalog, type CatalogData } from '../local/catalog';

export const CATALOG_CACHE_TAG = 'shopify-catalog';

/**
 * Live catalogue from the Shopify Storefront API, cached for five minutes and
 * invalidated immediately by product/inventory webhooks (`revalidateTag`).
 *
 * If Shopify is unreachable the storefront keeps serving the last imported
 * snapshot rather than an error page — and says so in the server log. Size
 * guides stay with the snapshot (and the CMS) because Shopify has no model for
 * them.
 */
const cachedLoad = unstable_cache(
  async () => {
    const live = await fetchStorefrontCatalog();
    return { products: live.products, collections: live.collections, fetchedAt: new Date().toISOString() };
  },
  ['shopify-catalog-v1'],
  { revalidate: 300, tags: [CATALOG_CACHE_TAG] },
);

export async function loadShopifyCatalog(): Promise<CatalogData> {
  const snapshot = await loadSnapshotCatalog();
  try {
    const live = await cachedLoad();
    return { products: live.products, collections: live.collections, sizeGuides: snapshot.sizeGuides };
  } catch (error) {
    console.error(`[catalog] Storefront API failed, serving the imported snapshot: ${(error as Error).message}`);
    return snapshot;
  }
}

export const shopifyCatalogRepository = new InMemoryCatalogRepository(loadShopifyCatalog);
