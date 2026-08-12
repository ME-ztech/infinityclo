/**
 * Shop URL state.
 *
 * Filters and sort live in the query string so a filtered view is shareable,
 * bookmarkable, and survives the back button. This module is the single place
 * that knows the encoding, used by both the server page and the client filter
 * UI so the two can never disagree about what a URL means.
 */
import { CATEGORY_GROUPS, type CategoryGroup } from '@/domain/taxonomy';
import type { ProductFilters, ProductSort } from '@/domain/types';

export const SORT_OPTIONS: ReadonlyArray<{ value: ProductSort; label: string }> = [
  { value: 'featured', label: 'Featured' },
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
];

const VALID_SORTS = new Set<string>(SORT_OPTIONS.map((option) => option.value));

/** Next passes repeated params as arrays; normalise both shapes to a list. */
function toList(value: string | string[] | undefined): string[] {
  if (!value) return [];
  const raw = Array.isArray(value) ? value : [value];
  return raw
    .flatMap((entry) => entry.split(','))
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export type RawSearchParams = Record<string, string | string[] | undefined>;

export interface ParsedShopParams {
  readonly filters: ProductFilters;
  readonly sort: ProductSort;
  readonly activeCount: number;
  /**
   * The catalogue chip selection (TOPS / HOODIES / …). Kept separate from
   * `filters` because it is derived by `domain/taxonomy` from the product's own
   * name rather than stored on the record, so the repository — which only knows
   * what the data says — cannot answer it. The page applies it after the query.
   */
  readonly group: CategoryGroup | null;
}

const VALID_GROUPS = new Set<string>(CATEGORY_GROUPS.map((group) => group.id));

export function parseShopParams(params: RawSearchParams): ParsedShopParams {
  const groupParam = typeof params.group === 'string' ? params.group : '';
  const group = VALID_GROUPS.has(groupParam) ? (groupParam as CategoryGroup) : null;

  const sizes = toList(params.size);
  const colours = toList(params.colour);
  const categories = toList(params.category);
  const collections = toList(params.collection);
  const inStockOnly = params.available === 'true';

  const sortParam = typeof params.sort === 'string' ? params.sort : '';
  const sort: ProductSort = VALID_SORTS.has(sortParam) ? (sortParam as ProductSort) : 'featured';

  const filters: ProductFilters = {
    ...(sizes.length > 0 && { sizes }),
    ...(colours.length > 0 && { colours }),
    ...(categories.length > 0 && { categories }),
    ...(collections.length > 0 && { collections }),
    ...(inStockOnly && { inStockOnly: true }),
  };

  const activeCount =
    sizes.length + colours.length + categories.length + collections.length + (inStockOnly ? 1 : 0);

  return { filters, sort, activeCount, group };
}

/**
 * Toggles one value in a multi-select facet and returns the new query string.
 * Sort is preserved; page position is not, since a filter change invalidates it.
 */
export function toggleFacetValue(
  current: URLSearchParams,
  key: string,
  value: string,
): URLSearchParams {
  const next = new URLSearchParams(current.toString());
  const existing = next.getAll(key).flatMap((entry) => entry.split(','));

  const updated = existing.includes(value)
    ? existing.filter((entry) => entry !== value)
    : [...existing, value];

  next.delete(key);
  if (updated.length > 0) next.set(key, updated.join(','));

  return next;
}

/**
 * Clears the facet drawer only. The sort order and the catalogue chip survive,
 * because "clear filters" means "widen this search", not "take me back to the
 * top of the shop" — losing the section a customer is browsing is a different
 * action and it has its own control.
 */
export function clearFilters(current: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams();
  const sort = current.get('sort');
  if (sort) next.set('sort', sort);
  const group = current.get('group');
  if (group) next.set('group', group);
  return next;
}
