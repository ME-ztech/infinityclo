import { describe, expect, it } from 'vitest';

import { clearFilters, parseShopParams, toggleFacetValue } from './shop-params';

describe('shop params', () => {
  it('defaults to featured sort when none is given', () => {
    expect(parseShopParams({}).sort).toBe('featured');
  });

  it('rejects an unknown sort rather than passing it through', () => {
    // An unvalidated sort would reach the repository and could change ordering
    // arbitrarily based on a hand-edited URL.
    expect(parseShopParams({ sort: 'drop-table' }).sort).toBe('featured');
  });

  it('parses comma-separated and repeated params identically', () => {
    expect(parseShopParams({ size: 'S,M' }).filters.sizes).toEqual(['S', 'M']);
    expect(parseShopParams({ size: ['S', 'M'] }).filters.sizes).toEqual(['S', 'M']);
  });

  it('omits empty facets rather than sending empty arrays', () => {
    const { filters } = parseShopParams({ size: '' });
    expect(filters.sizes).toBeUndefined();
  });

  it('counts every active filter', () => {
    const { activeCount } = parseShopParams({
      size: 'S,M',
      colour: 'Black',
      available: 'true',
    });
    expect(activeCount).toBe(4);
  });

  it('treats any non-true availability value as off', () => {
    expect(parseShopParams({ available: 'yes' }).filters.inStockOnly).toBeUndefined();
  });

  it('toggles a facet value on and back off', () => {
    const added = toggleFacetValue(new URLSearchParams(), 'size', 'M');
    expect(added.get('size')).toBe('M');

    const removed = toggleFacetValue(added, 'size', 'M');
    expect(removed.get('size')).toBeNull();
  });

  it('appends to an existing facet without dropping earlier values', () => {
    const params = toggleFacetValue(new URLSearchParams('size=S'), 'size', 'M');
    expect(params.get('size')).toBe('S,M');
  });

  it('keeps sort when clearing filters', () => {
    const cleared = clearFilters(new URLSearchParams('size=M&sort=newest'));
    expect(cleared.get('sort')).toBe('newest');
    expect(cleared.get('size')).toBeNull();
  });
});
