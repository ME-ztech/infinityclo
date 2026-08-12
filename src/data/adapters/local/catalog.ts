/**
 * Local catalog adapter — satisfies `CatalogRepository` from the imported
 * snapshot. All filtering, sorting, faceting and search run in-process over an
 * array, which is the right shape at this catalog size. Phase 2 replaces this
 * file with SQL; no consumer changes.
 */
import {
  colourValues,
  fromPrice,
  isColourOption,
  isSizeOption,
  isSoldOut,
  sizeValues,
} from '@/domain/product';
import type {
  Collection,
  FacetCounts,
  Product,
  ProductFilters,
  ProductQuery,
  ProductQueryResult,
  ProductSort,
  SizeGuide,
} from '@/domain/types';
import type { CatalogRepository } from '@/data/repositories';

import { collections, products, sizeGuides } from './snapshot';

function matchesFilters(product: Product, filters: ProductFilters | undefined): boolean {
  if (!filters) return true;

  if (filters.collections?.length) {
    const hit = filters.collections.some((slug) => product.collectionSlugs.includes(slug));
    if (!hit) return false;
  }

  if (filters.categories?.length) {
    if (!product.category || !filters.categories.includes(product.category)) return false;
  }

  if (filters.sizes?.length) {
    const available = sizeValues(product);
    if (!filters.sizes.some((size) => available.includes(size))) return false;
  }

  if (filters.colours?.length) {
    const available = colourValues(product);
    if (!filters.colours.some((colour) => available.includes(colour))) return false;
  }

  if (filters.inStockOnly && isSoldOut(product)) return false;

  const price = fromPrice(product);
  if (filters.minPrice !== undefined && (!price || price.amount < filters.minPrice)) return false;
  if (filters.maxPrice !== undefined && (!price || price.amount > filters.maxPrice)) return false;

  return true;
}

function compareProducts(sort: ProductSort): (a: Product, b: Product) => number {
  switch (sort) {
    case 'newest':
      return (a, b) => {
        const at = a.publishedAt ? Date.parse(a.publishedAt) : 0;
        const bt = b.publishedAt ? Date.parse(b.publishedAt) : 0;
        return bt - at || a.name.localeCompare(b.name);
      };
    case 'price_asc':
      return (a, b) =>
        (fromPrice(a)?.amount ?? Number.POSITIVE_INFINITY) -
          (fromPrice(b)?.amount ?? Number.POSITIVE_INFINITY) || a.name.localeCompare(b.name);
    case 'price_desc':
      return (a, b) =>
        (fromPrice(b)?.amount ?? Number.NEGATIVE_INFINITY) -
          (fromPrice(a)?.amount ?? Number.NEGATIVE_INFINITY) || a.name.localeCompare(b.name);
    case 'featured':
    default:
      // Unranked products sort after ranked ones, alphabetically among themselves,
      // so the order stays stable rather than mirroring snapshot insertion order.
      return (a, b) => {
        const ar = a.featuredRank ?? Number.POSITIVE_INFINITY;
        const br = b.featuredRank ?? Number.POSITIVE_INFINITY;
        return ar - br || a.name.localeCompare(b.name);
      };
  }
}

function tally(values: readonly string[]): ReadonlyArray<{ value: string; count: number }> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/**
 * Facets are computed over the products that match the *other* filters, not
 * over the final result set — otherwise selecting a size would collapse the
 * size facet to that one value and the customer could never widen the choice.
 */
function computeFacets(matched: readonly Product[]): FacetCounts {
  const sizes: string[] = [];
  const colours: string[] = [];
  const categories: string[] = [];
  const collectionSlugs: string[] = [];
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const product of matched) {
    sizes.push(...sizeValues(product));
    colours.push(...colourValues(product));
    if (product.category) categories.push(product.category);
    collectionSlugs.push(...product.collectionSlugs);
    const price = fromPrice(product);
    if (price) {
      min = Math.min(min, price.amount);
      max = Math.max(max, price.amount);
    }
  }

  return {
    sizes: tally(sizes),
    colours: tally(colours),
    categories: tally(categories),
    collections: tally(collectionSlugs),
    priceRange: Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null,
  };
}

/**
 * Scores a product against a search term. Name matches outrank metadata
 * matches, and a prefix match outranks a substring match, so "hoo" surfaces
 * the Hoodie before a jacket that merely mentions hoods in its description.
 */
function searchScore(product: Product, term: string): number {
  const needle = term.trim().toLowerCase();
  if (!needle) return 0;

  const name = product.name.toLowerCase();
  let score = 0;

  if (name === needle) score += 100;
  else if (name.startsWith(needle)) score += 60;
  else if (name.includes(needle)) score += 40;

  if (product.category?.toLowerCase().includes(needle)) score += 20;
  if (product.collectionSlugs.some((slug) => slug.includes(needle))) score += 15;
  if (product.tagline?.toLowerCase().includes(needle)) score += 10;
  if (product.description?.toLowerCase().includes(needle)) score += 5;
  if (colourValues(product).some((c) => c.toLowerCase().includes(needle))) score += 8;
  // Tags are the brand's own merchandising vocabulary, so a tag hit is a real
  // signal — but a weak one, below every field the customer can actually see.
  if (product.tags.some((tag) => tag.toLowerCase().includes(needle))) score += 6;

  // Multi-word queries: award partial credit per term so "black hoodie" still
  // ranks a black hoodie above an unrelated exact-name match on either word.
  const words = needle.split(/\s+/).filter((w) => w.length > 1);
  if (words.length > 1) {
    const haystack = `${name} ${product.category ?? ''} ${product.tagline ?? ''}`.toLowerCase();
    const hits = words.filter((word) => haystack.includes(word)).length;
    score += (hits / words.length) * 25;
  }

  return score;
}

export class LocalCatalogRepository implements CatalogRepository {
  async listProducts(query: ProductQuery = {}): Promise<ProductQueryResult> {
    const matched = products.filter((product) => matchesFilters(product, query.filters));
    const sorted = [...matched].sort(compareProducts(query.sort ?? 'featured'));

    const offset = query.offset ?? 0;
    const limit = query.limit ?? sorted.length;
    const page = sorted.slice(offset, offset + limit);

    return {
      products: page,
      total: sorted.length,
      // Facets describe the whole catalog so counts stay meaningful as the
      // customer narrows down; the shop UI shows them against the active filters.
      facets: computeFacets(products),
    };
  }

  async getProductBySlug(slug: string): Promise<Product | null> {
    return products.find((product) => product.slug === slug) ?? null;
  }

  async getProductsBySlugs(slugs: readonly string[]): Promise<readonly Product[]> {
    const bySlug = new Map(products.map((product) => [product.slug, product]));
    return slugs
      .map((slug) => bySlug.get(slug))
      .filter((product): product is Product => product !== undefined);
  }

  async listCollections(): Promise<readonly Collection[]> {
    return [...collections].sort((a, b) => {
      const at = a.releasedAt ? Date.parse(a.releasedAt) : 0;
      const bt = b.releasedAt ? Date.parse(b.releasedAt) : 0;
      return bt - at || a.name.localeCompare(b.name);
    });
  }

  async getCollectionBySlug(slug: string): Promise<Collection | null> {
    return collections.find((collection) => collection.slug === slug) ?? null;
  }

  async searchProducts(term: string, limit = 8): Promise<readonly Product[]> {
    if (!term.trim()) return [];
    return products
      .map((product) => ({ product, score: searchScore(product, term) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name))
      .slice(0, limit)
      .map((entry) => entry.product);
  }

  async getSizeGuide(id: string): Promise<SizeGuide | null> {
    return sizeGuides.find((guide) => guide.id === id) ?? null;
  }

  async listProductSlugs(): Promise<readonly string[]> {
    return products.map((product) => product.slug);
  }

  async listCollectionSlugs(): Promise<readonly string[]> {
    return collections.map((collection) => collection.slug);
  }
}

export const localCatalogRepository = new LocalCatalogRepository();

/** Re-exported so filter UIs can label option groups consistently. */
export { isColourOption, isSizeOption };
