/**
 * Catalogue import from the legacy snapshot.
 *
 * Step one of the Shopify migration: the products, variants, options and
 * photography captured in `src/data/catalog/products.json` are written into
 * INFNITY's own database. It is idempotent — keyed on each record's legacy id —
 * so it can be re-run after a fresh snapshot without creating duplicates, and
 * it never overwrites a product that staff have since edited here.
 *
 * What the public snapshot cannot tell us is **how many** of each variant are
 * on the shelf: Shopify's public feed says only "available" or "not". So:
 *
 *   sold-out variants   tracked, on hand 0.
 *   available variants  untracked ("not limited by stock") until a real count
 *                       is imported. They are listed in the report as
 *                       UNVERIFIED so nobody mistakes them for counted stock.
 *
 * `importInventoryCounts` then applies real counts from a Shopify inventory
 * export, which is the step that makes stock trustworthy before launch.
 */
import 'server-only';

import { eq, inArray } from 'drizzle-orm';

import type { Product } from '@/domain/types';

import { getDb, schema, type Database } from '../db/client';
import { newId } from '../db/ids';

const { products, productOptions, productVariants, productMedia, inventoryLevels, inventoryMovements } = schema;

export interface SeedReport {
  readonly productsCreated: number;
  readonly productsSkipped: number;
  readonly variantsCreated: number;
  readonly mediaCreated: number;
  readonly unverifiedStockVariants: number;
  readonly soldOutVariants: number;
}

export async function isCatalogEmpty(db?: Database): Promise<boolean> {
  const database = db ?? (await getDb());
  const [row] = await database.select({ id: products.id }).from(products).limit(1);
  return !row;
}

export async function seedCatalog(source: readonly Product[], actor = 'migration'): Promise<SeedReport> {
  const db = await getDb();
  const existing = new Set(
    (await db.select({ legacy: products.legacyShopifyId }).from(products)).map((row) => row.legacy).filter(Boolean),
  );
  const takenHandles = new Set((await db.select({ handle: products.handle }).from(products)).map((row) => row.handle));

  let productsCreated = 0;
  let productsSkipped = 0;
  let variantsCreated = 0;
  let mediaCreated = 0;
  let unverifiedStockVariants = 0;
  let soldOutVariants = 0;

  for (const [index, product] of source.entries()) {
    if (existing.has(product.id) || takenHandles.has(product.slug)) {
      productsSkipped += 1;
      continue;
    }
    await db.transaction(async (tx) => {
      const productId = newId('prd');
      await tx.insert(products).values({
        id: productId,
        handle: product.slug,
        title: product.name,
        description: product.description ?? '',
        productType: product.category ?? '',
        vendor: 'INFNITY',
        tags: [...product.tags],
        status: 'active',
        fabric: product.specification.materials,
        fit: product.specification.fit,
        care: product.specification.care,
        featuredRank: product.featuredRank ?? index + 1,
        legacyShopifyId: product.id,
        createdAt: product.publishedAt ? new Date(product.publishedAt) : new Date(),
      });

      for (const option of product.options) {
        await tx.insert(productOptions).values({
          id: newId('opt'),
          productId,
          name: option.name,
          position: option.position,
          values: [...option.values],
        });
      }

      const mediaIds = new Map<string, string>();
      for (const media of product.media) {
        const mediaId = newId('med');
        mediaIds.set(media.id, mediaId);
        await tx.insert(productMedia).values({
          id: mediaId,
          productId,
          url: media.url,
          alt: media.alt,
          width: media.width,
          height: media.height,
          position: media.position,
          kind: media.kind,
          sourceUrl: media.sourceUrl,
        });
        mediaCreated += 1;
      }

      for (const [position, variant] of product.variants.entries()) {
        // Migrated variants keep their legacy id as their id. Carts saved in
        // customers' browsers before the cutover, and pages rendered from the
        // snapshot, therefore still point at the right variant afterwards.
        const variantId = variant.id;
        const soldOut = variant.availability === 'sold_out' || variant.availability === 'archived';
        await tx.insert(productVariants).values({
          id: variantId,
          productId,
          title: variant.title,
          sku: variant.sku,
          priceCents: variant.price.amount,
          compareAtCents: variant.compareAtPrice?.amount ?? null,
          currency: variant.price.currency,
          optionValues: { ...variant.selectedOptions },
          position: position + 1,
          mediaId: variant.mediaId ? (mediaIds.get(variant.mediaId) ?? null) : null,
          legacyShopifyId: variant.id,
        });
        await tx.insert(inventoryLevels).values({ variantId, onHand: 0, tracked: soldOut });
        await tx.insert(inventoryMovements).values({
          id: newId('mov'),
          variantId,
          delta: 0,
          onHandAfter: 0,
          reason: 'migration',
          reference: soldOut ? 'Imported as sold out' : 'Imported as available; quantity UNVERIFIED',
          actor,
        });
        variantsCreated += 1;
        if (soldOut) soldOutVariants += 1;
        else unverifiedStockVariants += 1;
      }
    });
    productsCreated += 1;
  }

  return { productsCreated, productsSkipped, variantsCreated, mediaCreated, unverifiedStockVariants, soldOutVariants };
}

export interface InventoryImportReport {
  readonly applied: number;
  readonly unmatched: string[];
}

/**
 * Applies real stock counts, matched by legacy variant id or SKU. Each applied
 * count turns tracking on and writes a ledger entry, so afterwards the variant
 * is limited by a number someone actually counted.
 */
export async function importInventoryCounts(
  counts: ReadonlyArray<{ legacyVariantId?: string | null; sku?: string | null; onHand: number }>,
  actor = 'migration',
): Promise<InventoryImportReport> {
  const db = await getDb();
  const variants = await db
    .select({ id: productVariants.id, legacy: productVariants.legacyShopifyId, sku: productVariants.sku })
    .from(productVariants);
  const byLegacy = new Map(variants.filter((variant) => variant.legacy).map((variant) => [variant.legacy!, variant.id]));
  const bySku = new Map(variants.filter((variant) => variant.sku).map((variant) => [variant.sku!, variant.id]));

  let applied = 0;
  const unmatched: string[] = [];
  for (const row of counts) {
    const variantId =
      (row.legacyVariantId && byLegacy.get(row.legacyVariantId)) || (row.sku && bySku.get(row.sku)) || null;
    if (!variantId || !Number.isInteger(row.onHand) || row.onHand < 0) {
      unmatched.push(row.legacyVariantId ?? row.sku ?? '(no identifier)');
      continue;
    }
    await db.transaction(async (tx) => {
      const [level] = await tx.select().from(inventoryLevels).where(eq(inventoryLevels.variantId, variantId));
      await tx
        .update(inventoryLevels)
        .set({ onHand: row.onHand, tracked: true, updatedAt: new Date() })
        .where(eq(inventoryLevels.variantId, variantId));
      await tx.insert(inventoryMovements).values({
        id: newId('mov'),
        variantId,
        delta: row.onHand - (level?.onHand ?? 0),
        onHandAfter: row.onHand,
        reason: 'migration',
        reference: 'Counted stock imported',
        actor,
      });
    });
    applied += 1;
  }
  return { applied, unmatched };
}

/** Variants still selling without a counted quantity. Zero before launch. */
export async function unverifiedStock(): Promise<Array<{ product: string; variant: string }>> {
  const db = await getDb();
  const untracked = await db.select().from(inventoryLevels).where(eq(inventoryLevels.tracked, false));
  if (untracked.length === 0) return [];
  const rows = await db
    .select({ variant: productVariants.title, product: products.title })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(
      inArray(
        productVariants.id,
        untracked.map((level) => level.variantId),
      ),
    );
  return rows;
}
