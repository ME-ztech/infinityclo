/**
 * Category taxonomy.
 *
 * The catalogue's filter chips (TOPS / HOODIES / BOTTOMS / ACCESSORIES) need a
 * grouping the source data does not always supply — Shopify's `product_type` is
 * frequently blank on the legacy store, and where it is set it is inconsistent.
 *
 * This module *classifies* rather than invents: every rule keys off words that
 * are already in the product's own name or type. "INFNITY'S ICED RAVEN TANK"
 * contains "tank", so it is a top. Nothing is assigned on a hunch, and a product
 * whose garment type cannot be read from its own name stays uncategorised and
 * appears only under ALL — which is honest, and still shoppable.
 *
 * Ordering matters. A "hoodie" is checked before "top" so that a hooded
 * sweatshirt lands in HOODIES rather than being swept up by a broader rule.
 */
import type { Product } from './types';

export type CategoryGroup = 'hoodies' | 'tops' | 'bottoms' | 'accessories';

export interface CategoryGroupDefinition {
  readonly id: CategoryGroup;
  readonly label: string;
  /** Whole-word patterns matched against the product name and type. */
  readonly patterns: readonly RegExp[];
}

/**
 * Evaluated top to bottom; first match wins.
 *
 * Patterns are anchored on word boundaries so "tank" does not match "tanked"
 * and, more importantly, so "short" does not match "short sleeve" — the reason
 * the bottoms rule spells out `shorts` in the plural.
 */
export const CATEGORY_GROUPS: readonly CategoryGroupDefinition[] = [
  {
    id: 'hoodies',
    label: 'Hoodies',
    patterns: [
      /\bhoodies?\b/,
      /\bhooded\b/,
      /\bcrewneck\b/,
      /\bsweatshirts?\b/,
      /\bzip[- ]?ups?\b/,
    ],
  },
  {
    id: 'bottoms',
    label: 'Bottoms',
    patterns: [
      /\bsweat ?pants?\b/,
      /\bpants?\b/,
      /\bshorts\b/,
      /\bjoggers?\b/,
      /\bdenim\b/,
      /\bjeans\b/,
      /\bcargos?\b/,
      /\btrousers?\b/,
    ],
  },
  {
    id: 'accessories',
    label: 'Accessories',
    patterns: [
      /\bsocks?\b/,
      /\bkeychains?\b/,
      /\bbeanies?\b/,
      /\bhats?\b/,
      /\bcaps?\b/,
      /\bbags?\b/,
      /\bbelts?\b/,
      /\bstickers?\b/,
      /\blanyards?\b/,
      /\bbandanas?\b/,
      /\bchains?\b/,
    ],
  },
  {
    id: 'tops',
    label: 'Tops',
    patterns: [
      /\btanks?\b/,
      /\btees?\b/,
      /\bt-shirts?\b/,
      /\bshirts?\b/,
      /\bjerseys?\b/,
      /\blong ?sleeves?\b/,
      /\bpolos?\b/,
      /\btops?\b/,
    ],
  },
];

/**
 * The group a product belongs to, or null when its own copy does not say.
 *
 * `category` is consulted first because a merchandiser-set product type is a
 * stronger signal than a marketing name, then the name is used as the fallback.
 */
export function categoryGroupOf(product: Product): CategoryGroup | null {
  const haystack = `${product.category ?? ''} ${product.name}`.toLowerCase();

  for (const group of CATEGORY_GROUPS) {
    if (group.patterns.some((pattern) => pattern.test(haystack))) return group.id;
  }
  return null;
}

export function labelForGroup(id: CategoryGroup): string {
  return CATEGORY_GROUPS.find((group) => group.id === id)?.label ?? id;
}

/**
 * Display order for the catalogue chips.
 *
 * Deliberately different from `CATEGORY_GROUPS`, which is ordered by *matching
 * specificity* — hoodies must be tested before tops so a hooded sweatshirt is
 * not swept up by the broader rule. That ordering is an implementation detail of
 * the classifier and makes no sense as a merchandising sequence, so the two are
 * kept apart rather than compromising one for the other.
 */
const CHIP_ORDER: readonly CategoryGroup[] = ['tops', 'hoodies', 'bottoms', 'accessories'];

/**
 * The groups actually represented in a set of products, in merchandising order.
 *
 * The catalogue renders chips from this rather than from the full list, so a
 * BOTTOMS chip never appears on a storefront that is currently selling none.
 */
export function availableGroups(products: readonly Product[]): readonly CategoryGroupDefinition[] {
  const present = new Set<CategoryGroup>();
  for (const product of products) {
    const group = categoryGroupOf(product);
    if (group) present.add(group);
  }

  return CHIP_ORDER.filter((id) => present.has(id)).map((id) =>
    CATEGORY_GROUPS.find((group) => group.id === id)!,
  );
}
