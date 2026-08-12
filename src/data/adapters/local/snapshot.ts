/**
 * Loads the imported catalog snapshot.
 *
 * The snapshot is produced by `npm run import:legacy`, which reads the legacy
 * INFNITY store once and normalises it into this repository. The storefront
 * never contacts the legacy site at runtime — see docs/STOREFRONT_ARCHITECTURE.md.
 *
 * When no snapshot is present the storefront degrades honestly: every surface
 * renders its empty state and no product data is invented to fill the gap.
 */
import type {
  Campaign,
  Collection,
  EditorialStory,
  Product,
  SizeGuide,
  UGCEntry,
} from '@/domain/types';

import campaignsJson from '@/data/catalog/campaigns.json';
import collectionsJson from '@/data/catalog/collections.json';
import editorialJson from '@/data/catalog/editorial.json';
import productsJson from '@/data/catalog/products.json';
import sizeGuidesJson from '@/data/catalog/size-guides.json';
import ugcJson from '@/data/catalog/ugc.json';

export interface CatalogSnapshotMeta {
  /** ISO-8601 timestamp of the import run that produced this snapshot. */
  readonly importedAt: string | null;
  readonly source: string | null;
  readonly productCount: number;
}

/**
 * The JSON files are authored by the importer against the domain types, so a
 * cast is appropriate at this single boundary. `validateSnapshot` below is the
 * runtime guard that keeps a malformed snapshot from reaching the UI.
 */
export const products = productsJson as unknown as readonly Product[];
export const collections = collectionsJson as unknown as readonly Collection[];
export const sizeGuides = sizeGuidesJson as unknown as readonly SizeGuide[];
export const campaigns = campaignsJson as unknown as readonly Campaign[];
export const editorialStories = editorialJson as unknown as readonly EditorialStory[];
export const ugcEntries = ugcJson as unknown as readonly UGCEntry[];

export function isCatalogEmpty(): boolean {
  return products.length === 0;
}

export const snapshotMeta: CatalogSnapshotMeta = {
  importedAt: null,
  source: null,
  productCount: products.length,
};

/**
 * Structural check used by tests and by the importer's verification step.
 * Returns the problems found rather than throwing, so a partial snapshot can be
 * reported in full instead of failing on the first bad record.
 */
export function validateSnapshot(): readonly string[] {
  const problems: string[] = [];
  const seenSlugs = new Set<string>();

  for (const product of products) {
    if (!product.slug) {
      problems.push(`Product "${product.name ?? product.id}" has no slug.`);
      continue;
    }
    if (seenSlugs.has(product.slug)) {
      problems.push(`Duplicate product slug: ${product.slug}`);
    }
    seenSlugs.add(product.slug);

    if (product.variants.length === 0) {
      problems.push(`Product ${product.slug} has no variants.`);
    }
    if (product.media.length === 0) {
      problems.push(`Product ${product.slug} has no media.`);
    }
    for (const media of product.media) {
      if (!media.alt) problems.push(`Media ${media.id} on ${product.slug} has no alt text.`);
    }
    for (const slug of product.collectionSlugs) {
      if (!collections.some((c) => c.slug === slug)) {
        problems.push(`Product ${product.slug} references unknown collection "${slug}".`);
      }
    }
    if (product.sizeGuideId && !sizeGuides.some((g) => g.id === product.sizeGuideId)) {
      problems.push(`Product ${product.slug} references unknown size guide.`);
    }
  }

  for (const collection of collections) {
    for (const slug of collection.productSlugs) {
      if (!seenSlugs.has(slug)) {
        problems.push(`Collection ${collection.slug} references unknown product "${slug}".`);
      }
    }
  }

  for (const entry of ugcEntries) {
    for (const slug of entry.productSlugs) {
      if (!seenSlugs.has(slug)) {
        problems.push(`UGC ${entry.id} references unknown product "${slug}".`);
      }
    }
  }

  return problems;
}
