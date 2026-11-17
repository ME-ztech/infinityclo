/**
 * Catalogue — reads the storefront's products from INFNITY's own database.
 *
 * Visibility is one rule, applied in one place: a product is public when its
 * status is `active` and its `publish_at` (if any) has passed. A scheduled
 * launch therefore goes live by the clock, with no deployment and no job.
 *
 * Availability is derived from the inventory counters on every read, so a
 * variant flips to sold out the moment its last unit is reserved.
 */
import 'server-only';

import { and, asc, eq, inArray, isNull, lte, or } from 'drizzle-orm';
import { cache } from 'react';

import type { CatalogData } from '@/data/adapters/local/catalog';
import type { Collection, InventoryDisplayState, Product } from '@/domain/types';

import { getDb, schema } from '../db/client';

const { products, productOptions, productVariants, productMedia, inventoryLevels, collections, collectionProducts } =
  schema;

export const CATALOG_TAG = 'catalog';

type ProductRow = typeof products.$inferSelect;

interface LoadOptions {
  /** Include drafts, archived and scheduled products (admin, previews). */
  readonly includeUnpublished?: boolean;
  readonly handles?: readonly string[];
}

export async function loadProducts(options: LoadOptions = {}): Promise<Product[]> {
  const db = await getDb();
  const now = new Date();
  const visible = options.includeUnpublished
    ? undefined
    : and(eq(products.status, 'active'), or(isNull(products.publishAt), lte(products.publishAt, now)));
  const scoped = options.handles ? inArray(products.handle, [...options.handles]) : undefined;

  const rows = await db
    .select()
    .from(products)
    .where(and(visible, scoped))
    .orderBy(asc(products.featuredRank), asc(products.title));
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);

  const [optionRows, variantRows, mediaRows, levelRows, membership] = await Promise.all([
    db.select().from(productOptions).where(inArray(productOptions.productId, ids)).orderBy(asc(productOptions.position)),
    db.select().from(productVariants).where(inArray(productVariants.productId, ids)).orderBy(asc(productVariants.position)),
    db.select().from(productMedia).where(inArray(productMedia.productId, ids)).orderBy(asc(productMedia.position)),
    db
      .select({ level: inventoryLevels, productId: productVariants.productId })
      .from(inventoryLevels)
      .innerJoin(productVariants, eq(productVariants.id, inventoryLevels.variantId))
      .where(inArray(productVariants.productId, ids)),
    db
      .select({ productId: collectionProducts.productId, handle: collections.handle })
      .from(collectionProducts)
      .innerJoin(collections, eq(collections.id, collectionProducts.collectionId))
      .where(inArray(collectionProducts.productId, ids)),
  ]);

  const levels = new Map(levelRows.map((row) => [row.level.variantId, row.level]));

  const availabilityOf = (row: ProductRow, variantId: string): InventoryDisplayState => {
    if (row.status === 'archived') return 'archived';
    const level = levels.get(variantId);
    if (!level) return 'sold_out';
    if (!level.tracked || row.preorder) return 'in_stock';
    return level.onHand - level.reserved > 0 ? 'in_stock' : 'sold_out';
  };

  return rows.map((row): Product => ({
    id: row.id,
    slug: row.handle,
    name: row.title,
    tagline: null,
    description: row.description || null,
    category: row.productType || null,
    collectionSlugs: membership.filter((entry) => entry.productId === row.id).map((entry) => entry.handle),
    options: optionRows
      .filter((option) => option.productId === row.id)
      .map((option) => ({ id: option.id, name: option.name, position: option.position, values: option.values })),
    variants: variantRows
      .filter((variant) => variant.productId === row.id)
      .map((variant) => ({
        id: variant.id,
        sku: variant.sku,
        title: variant.title,
        price: { amount: variant.priceCents, currency: variant.currency === 'USD' ? 'USD' : 'CAD' },
        compareAtPrice:
          variant.compareAtCents !== null && variant.compareAtCents > variant.priceCents
            ? { amount: variant.compareAtCents, currency: variant.currency === 'USD' ? 'USD' : 'CAD' }
            : null,
        availability: availabilityOf(row, variant.id),
        selectedOptions: variant.optionValues,
        mediaId: variant.mediaId,
      })),
    media: mediaRows
      .filter((media) => media.productId === row.id)
      .map((media) => ({
        id: media.id,
        url: media.url,
        alt: media.alt,
        kind: (media.kind as Product['media'][number]['kind']) ?? 'product',
        width: media.width,
        height: media.height,
        position: media.position,
        sourceUrl: media.sourceUrl,
      })),
    specification: {
      materials: row.fabric,
      fit: row.fit,
      care: row.care,
      construction: null,
      weightGsm: null,
      countryOfOrigin: null,
      modelInfo: null,
    },
    tags: row.tags,
    sizeGuideId: row.sizeChart,
    publishedAt: (row.publishAt ?? row.createdAt).toISOString(),
    legacyUrl: null,
    featuredRank: row.featuredRank,
  }));
}

export async function loadCollections(): Promise<Collection[]> {
  const db = await getDb();
  const rows = await db.select().from(collections).where(eq(collections.published, true));
  if (rows.length === 0) return [];
  const members = await db
    .select({ collectionId: collectionProducts.collectionId, handle: products.handle, position: collectionProducts.position })
    .from(collectionProducts)
    .innerJoin(products, eq(products.id, collectionProducts.productId))
    .orderBy(asc(collectionProducts.position));
  return rows.map((row) => ({
    slug: row.handle,
    name: row.title,
    description: row.description || null,
    heroMedia: null,
    dropLabel: null,
    releasedAt: null,
    isArchived: false,
    productSlugs: members.filter((member) => member.collectionId === row.id).map((member) => member.handle),
    legacyUrl: null,
  }));
}

/**
 * The public catalogue, read once per request. Pages that render it set their
 * own `revalidate`, and admin writes call `revalidateTag(CATALOG_TAG)` plus
 * `revalidatePath`, so an edit or a sale shows up without a deployment.
 */
export const loadPublicCatalog = cache(async (): Promise<CatalogData> => {
  const [productList, collectionList] = await Promise.all([loadProducts(), loadCollections()]);
  return { products: productList, collections: collectionList };
});

