/**
 * Derivations over the product model.
 *
 * Every function here is pure and storage-agnostic, so the same logic serves
 * the local JSON adapter today and a PostgreSQL-backed one in Phase 2.
 */
import { isDiscounted } from './money';
import type { InventoryDisplayState, Money, Product, ProductMedia, ProductVariant } from './types';

/** Days a product is badged NEW after publication. */
const NEW_WINDOW_DAYS = 30;

export const SIZE_OPTION_NAMES = ['size', 'sizes'] as const;
export const COLOUR_OPTION_NAMES = ['colour', 'color', 'colours', 'colors'] as const;

function optionMatches(name: string, candidates: readonly string[]): boolean {
  return candidates.includes(name.trim().toLowerCase());
}

export function isSizeOption(name: string): boolean {
  return optionMatches(name, SIZE_OPTION_NAMES);
}

export function isColourOption(name: string): boolean {
  return optionMatches(name, COLOUR_OPTION_NAMES);
}

/** The variant a PDP should select on first paint: cheapest available, else first. */
export function defaultVariant(product: Product): ProductVariant | null {
  const available = product.variants.filter((v) => v.availability !== 'sold_out');
  const pool = available.length > 0 ? available : product.variants;
  if (pool.length === 0) return null;
  return pool.reduce((best, v) => (v.price.amount < best.price.amount ? v : best));
}

/** Lowest price across variants — what a product card shows. */
export function fromPrice(product: Product): Money | null {
  if (product.variants.length === 0) return null;
  return product.variants.reduce<Money>(
    (min, v) => (v.price.amount < min.amount ? v.price : min),
    product.variants[0]!.price,
  );
}

/** The compare-at price matching the lowest-priced variant, when discounted. */
export function fromCompareAtPrice(product: Product): Money | null {
  const cheapest = product.variants.reduce<ProductVariant | null>(
    (min, v) => (min === null || v.price.amount < min.price.amount ? v : min),
    null,
  );
  if (!cheapest) return null;
  return isDiscounted(cheapest.price, cheapest.compareAtPrice) ? cheapest.compareAtPrice : null;
}

export function isOnSale(product: Product): boolean {
  return fromCompareAtPrice(product) !== null;
}

/**
 * Rolls variant availability up to the product. Sold out only when every
 * variant is; unknown only when we genuinely know nothing.
 */
export function productAvailability(product: Product): InventoryDisplayState {
  if (product.variants.length === 0) return 'unknown';
  const states = new Set(product.variants.map((v) => v.availability));
  if (states.has('in_stock')) return 'in_stock';
  if (states.has('low_stock')) return 'low_stock';
  if (states.has('archived') && !states.has('sold_out')) return 'archived';
  if (states.has('sold_out')) return 'sold_out';
  return 'unknown';
}

export function isSoldOut(product: Product): boolean {
  const state = productAvailability(product);
  return state === 'sold_out' || state === 'archived';
}

export function isNew(product: Product, now: Date = new Date()): boolean {
  if (!product.publishedAt) return false;
  const published = Date.parse(product.publishedAt);
  if (Number.isNaN(published)) return false;
  const ageMs = now.getTime() - published;
  return ageMs >= 0 && ageMs <= NEW_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

/** Gallery order: explicit position first, product shots ahead of detail shots. */
const MEDIA_KIND_ORDER: Record<ProductMedia['kind'], number> = {
  product: 0,
  model: 1,
  detail: 2,
  campaign: 3,
  ugc: 4,
};

export function orderedMedia(product: Product): readonly ProductMedia[] {
  return [...product.media].sort(
    (a, b) => a.position - b.position || MEDIA_KIND_ORDER[a.kind] - MEDIA_KIND_ORDER[b.kind],
  );
}

export function primaryMedia(product: Product): ProductMedia | null {
  return orderedMedia(product)[0] ?? null;
}

/** The image a card cross-fades to on hover. Null when there is only one shot. */
export function secondaryMedia(product: Product): ProductMedia | null {
  const ordered = orderedMedia(product);
  if (ordered.length < 2) return null;
  return ordered.find((m) => m.kind === 'model') ?? ordered[1] ?? null;
}

export function mediaById(product: Product, id: string | null): ProductMedia | null {
  if (!id) return null;
  return product.media.find((m) => m.id === id) ?? null;
}

/** Distinct values for an option across variants, preserving declared order. */
export function optionValues(product: Product, optionName: string): readonly string[] {
  const option = product.options.find(
    (o) => o.name.trim().toLowerCase() === optionName.trim().toLowerCase(),
  );
  return option?.values ?? [];
}

export function sizeValues(product: Product): readonly string[] {
  const option = product.options.find((o) => isSizeOption(o.name));
  return option?.values ?? [];
}

export function colourValues(product: Product): readonly string[] {
  const option = product.options.find((o) => isColourOption(o.name));
  return option?.values ?? [];
}

/** Finds the variant matching a full set of option selections. */
export function findVariant(
  product: Product,
  selections: Readonly<Record<string, string>>,
): ProductVariant | null {
  return (
    product.variants.find((variant) =>
      Object.entries(selections).every(([name, value]) => variant.selectedOptions[name] === value),
    ) ?? null
  );
}

/**
 * Whether an option value can still be reached given the other selections.
 * Drives the struck-through unavailable sizes on the PDP.
 */
export function isOptionValueAvailable(
  product: Product,
  optionName: string,
  value: string,
  selections: Readonly<Record<string, string>>,
): boolean {
  const others = Object.entries(selections).filter(([name]) => name !== optionName);
  return product.variants.some((variant) => {
    if (variant.selectedOptions[optionName] !== value) return false;
    if (variant.availability === 'sold_out' || variant.availability === 'archived') return false;
    return others.every(([name, v]) => variant.selectedOptions[name] === v);
  });
}

/** Products sharing a collection, nearest first. Never includes the seed itself. */
export function relatedProducts(
  product: Product,
  catalog: readonly Product[],
  limit = 4,
): readonly Product[] {
  const scored = catalog
    .filter((candidate) => candidate.slug !== product.slug)
    .map((candidate) => {
      const shared = candidate.collectionSlugs.filter((slug) =>
        product.collectionSlugs.includes(slug),
      ).length;
      const sameCategory = candidate.category && candidate.category === product.category ? 1 : 0;
      return { candidate, score: shared * 2 + sameCategory };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((entry) => entry.candidate);
}
