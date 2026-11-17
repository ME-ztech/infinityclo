/**
 * Storefront read helpers — small compositions over the CMS, the catalogue and
 * the operational records, shared by the public pages.
 */
import 'server-only';

import { catalogRepository, contentRepository } from '@/data';
import { isSoldOut } from '@/domain/product';
import { SIZE_CHARTS, defaultSizeChartFor, type SizeChart } from '@/domain/size-charts';
import { categoryGroupOf } from '@/domain/taxonomy';
import type { Product, UGCEntry } from '@/domain/types';

import { getProductContent, type ProductContent, type SiteContent } from './cms';
import { hiddenLegacyWallIds, listSubmissions } from './records';

/**
 * The community wall: the legacy wall the brand already published (minus
 * anything staff have hidden) followed by approved submissions. A handle is
 * shown only where the person asked to be credited.
 */
export async function getCommunityWall(limit?: number): Promise<UGCEntry[]> {
  const [legacy, hidden, submissions] = await Promise.all([
    contentRepository.listUGC(),
    hiddenLegacyWallIds(),
    listSubmissions().catch(() => []),
  ]);

  const approved: UGCEntry[] = submissions
    .filter((submission) => submission.status === 'approved')
    .map((submission, index) => ({
      id: submission.id,
      media: {
        id: `${submission.id}-media`,
        url: submission.image.url,
        alt:
          submission.creditPublicly && submission.handle
            ? `${submission.handle} styled in INFNITY`
            : 'A member of the Troop styled in INFNITY',
        kind: 'ugc',
        width: submission.image.width,
        height: submission.image.height,
        position: index + 1,
        sourceUrl: null,
      },
      handle: submission.creditPublicly ? submission.handle : null,
      caption: submission.caption,
      productSlugs: submission.productSlugs,
      sourceUrl: null,
    }));

  const wall = [...approved, ...legacy.filter((entry) => !hidden.has(entry.id))];
  return limit ? wall.slice(0, limit) : wall;
}

/**
 * Products for the homepage's featured section: the owner's picks when set
 * (dropping any that no longer exist), otherwise the newest pieces that can
 * actually be bought.
 */
export async function getFeaturedProducts(content: SiteContent, limit = 8): Promise<Product[]> {
  if (content.featured.productSlugs.length > 0) {
    const picked = await catalogRepository.getProductsBySlugs(content.featured.productSlugs);
    if (picked.length > 0) return [...picked].slice(0, limit);
  }
  const { products } = await catalogRepository.listProducts({ sort: 'newest' });
  const inStock = products.filter((product) => !isSoldOut(product));
  return (inStock.length > 0 ? inStock : [...products]).slice(0, limit);
}

/**
 * "You may also like": purchasable pieces only, the same kind of garment first,
 * never the product being viewed and never anything in `exclude` (for example
 * what is already in the cart).
 */
export function recommendProducts(
  catalog: readonly Product[],
  anchors: readonly Product[],
  limit = 4,
  exclude: ReadonlySet<string> = new Set(),
): Product[] {
  const anchorSlugs = new Set(anchors.map((product) => product.slug));
  const groups = new Set(anchors.map((product) => categoryGroupOf(product)).filter(Boolean));
  const candidates = catalog.filter(
    (product) =>
      !anchorSlugs.has(product.slug) &&
      !exclude.has(product.slug) &&
      !isSoldOut(product) &&
      product.media.length > 0,
  );
  const byNewest = (a: Product, b: Product) =>
    (b.publishedAt ? Date.parse(b.publishedAt) : 0) - (a.publishedAt ? Date.parse(a.publishedAt) : 0);
  const same = candidates.filter((product) => groups.has(categoryGroupOf(product))).sort(byNewest);
  const other = candidates.filter((product) => !groups.has(categoryGroupOf(product))).sort(byNewest);
  // Complementary pieces lead when the anchor's own category is thin.
  return [...same, ...other].slice(0, limit);
}

export interface ProductPresentation {
  readonly content: ProductContent | null;
  readonly sizeChart: SizeChart | null;
  /** Confirmed copy only; a missing section is `null` and is not rendered. */
  readonly fit: string | null;
  readonly fabric: string | null;
  readonly care: string | null;
}

/** Owner-entered product content, falling back to facts read from the brand's own copy. */
export async function getProductPresentation(product: Product): Promise<ProductPresentation> {
  const content = await getProductContent(product.slug);
  const spec = product.specification;
  const chartId = content?.sizeChart ?? defaultSizeChartFor(product);

  const fit = content?.fit ?? ([spec.fit, spec.modelInfo].filter(Boolean).join('\n') || null);
  const fabricFacts = [
    spec.materials,
    // The importer often reads the weight out of the same sentence as the fabric.
    spec.weightGsm && !spec.materials?.includes(String(spec.weightGsm)) ? `${spec.weightGsm} gsm` : null,
    spec.construction,
    spec.countryOfOrigin ? `Made in ${spec.countryOfOrigin}` : null,
  ].filter(Boolean);
  const fabric = content?.fabric ?? (fabricFacts.join('\n') || null);
  const care = content?.care ?? spec.care ?? null;

  return { content, sizeChart: chartId ? SIZE_CHARTS[chartId] : null, fit, fabric, care };
}
