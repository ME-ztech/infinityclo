/**
 * Loads the catalogue the storefront serves.
 *
 * Two sources, in strict priority order:
 *
 *   1. **The imported snapshot.** Produced by `npm run import:catalog`, which
 *      reads infinityclo.ca once and normalises it into this repository —
 *      products, prices, sizes, descriptions and every product photograph,
 *      downloaded into `public/products/`. This is the real catalogue and it
 *      always wins.
 *   2. **The verified seed** in `src/data/catalog/seed.ts`. Real product names
 *      and real prices transcribed from the brand's own storefront, with no
 *      photography and no invented fields. Used only when the import has not
 *      run — which is the case in any environment where infinityclo.ca is
 *      unreachable.
 *
 * The storefront never contacts the source site at runtime under either source.
 * See docs/STOREFRONT_ARCHITECTURE.md.
 *
 * There is deliberately no third case. If both are empty the storefront renders
 * its empty states; no product data is invented to fill the gap.
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
import { seedCollections, seedProducts } from '@/data/catalog/seed';

export type CatalogSource = 'imported' | 'seed' | 'empty';

/**
 * The JSON files are authored by the importer against the domain types, so a
 * cast is appropriate at this single boundary. `validateSnapshot` below is the
 * runtime guard that keeps a malformed snapshot from reaching the UI.
 */
const importedProducts = productsJson as unknown as readonly Product[];
const importedCollections = collectionsJson as unknown as readonly Collection[];

const hasImport = importedProducts.length > 0;

export const catalogSource: CatalogSource = hasImport
  ? 'imported'
  : seedProducts.length > 0
    ? 'seed'
    : 'empty';

export const products: readonly Product[] = hasImport ? importedProducts : seedProducts;

/**
 * Collections follow the products. Serving imported collections alongside seed
 * products would leave every collection pointing at slugs that do not exist.
 */
export const collections: readonly Collection[] = hasImport ? importedCollections : seedCollections;

export const sizeGuides = sizeGuidesJson as unknown as readonly SizeGuide[];
export const campaigns = campaignsJson as unknown as readonly Campaign[];
export const editorialStories = editorialJson as unknown as readonly EditorialStory[];
export const ugcEntries = ugcJson as unknown as readonly UGCEntry[];

export function isCatalogEmpty(): boolean {
  return products.length === 0;
}

/** True when the catalogue has no photography at all — drives copy, not layout. */
export function isCatalogUnphotographed(): boolean {
  return products.length > 0 && products.every((product) => product.media.length === 0);
}

export interface CatalogSnapshotMeta {
  readonly source: CatalogSource;
  readonly productCount: number;
  readonly mediaCount: number;
}

export const snapshotMeta: CatalogSnapshotMeta = {
  source: catalogSource,
  productCount: products.length,
  mediaCount: products.reduce((total, product) => total + product.media.length, 0),
};

/**
 * Structural validation.
 *
 * Split into two lists on purpose. `errors` are contradictions — a duplicate
 * slug, a dangling collection reference — that would make the storefront behave
 * incorrectly. `gaps` are content that has not arrived yet, most obviously
 * photography on the seed catalogue: absent, but not wrong.
 *
 * Both are returned rather than thrown, so a partial catalogue can be reported
 * in full instead of failing on its first bad record.
 */
export interface SnapshotValidation {
  readonly errors: readonly string[];
  readonly gaps: readonly string[];
}

export function validateSnapshot(): SnapshotValidation {
  const errors: string[] = [];
  const gaps: string[] = [];
  const seenSlugs = new Set<string>();

  for (const product of products) {
    if (!product.slug) {
      errors.push(`Product "${product.name ?? product.id}" has no slug.`);
      continue;
    }
    if (seenSlugs.has(product.slug)) errors.push(`Duplicate product slug: ${product.slug}`);
    seenSlugs.add(product.slug);

    if (product.variants.length === 0) errors.push(`Product ${product.slug} has no variants.`);

    if (product.media.length === 0) {
      gaps.push(`Product ${product.slug} has no photography.`);
    } else {
      for (const media of product.media) {
        if (!media.alt) errors.push(`Media ${media.id} on ${product.slug} has no alt text.`);
      }
      if (product.media.length === 1) {
        gaps.push(`Product ${product.slug} has one shot — no hover or gallery state.`);
      }
    }

    if (product.options.length === 0) {
      gaps.push(`Product ${product.slug} has no size or colour axis.`);
    }

    for (const slug of product.collectionSlugs) {
      if (!collections.some((collection) => collection.slug === slug)) {
        errors.push(`Product ${product.slug} references unknown collection "${slug}".`);
      }
    }
    if (product.sizeGuideId && !sizeGuides.some((guide) => guide.id === product.sizeGuideId)) {
      errors.push(`Product ${product.slug} references unknown size guide.`);
    }
  }

  for (const collection of collections) {
    for (const slug of collection.productSlugs) {
      if (!seenSlugs.has(slug)) {
        errors.push(`Collection ${collection.slug} references unknown product "${slug}".`);
      }
    }
  }

  for (const entry of ugcEntries) {
    for (const slug of entry.productSlugs) {
      if (!seenSlugs.has(slug)) {
        errors.push(`UGC ${entry.id} references unknown product "${slug}".`);
      }
    }
  }

  return { errors, gaps };
}
