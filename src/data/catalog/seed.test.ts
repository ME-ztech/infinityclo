import { describe, expect, it } from 'vitest';

import { seedCollections, seedProducts } from './seed';
import { fromCompareAtPrice, fromPrice, productAvailability } from '@/domain/product';
import { categoryGroupOf } from '@/domain/taxonomy';

/**
 * Guards on the verified seed catalogue.
 *
 * The seed exists because this build environment cannot reach infinityclo.ca,
 * and its whole justification is that every value in it was read off the
 * brand's own storefront. These tests enforce that discipline mechanically, so
 * the file cannot quietly drift into invented content later: no photography, no
 * assumed size runs, no fabricated copy, and no product that cannot be sold.
 */
describe('verified seed catalogue', () => {
  it('carries the products transcribed from the storefront', () => {
    expect(seedProducts).toHaveLength(10);
  });

  it('has unique slugs', () => {
    const slugs = seedProducts.map((product) => product.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('gives every piece a real, positive price', () => {
    for (const product of seedProducts) {
      const price = fromPrice(product);
      expect(price, product.slug).not.toBeNull();
      expect(price!.amount, product.slug).toBeGreaterThan(0);
      expect(price!.currency).toBe('CAD');
    }
  });

  it('only marks a piece on sale when the compare-at price is genuinely higher', () => {
    for (const product of seedProducts) {
      const compareAt = fromCompareAtPrice(product);
      if (!compareAt) continue;
      expect(compareAt.amount, product.slug).toBeGreaterThan(fromPrice(product)!.amount);
    }
  });

  it('invents no photography', () => {
    for (const product of seedProducts) {
      expect(product.media, product.slug).toHaveLength(0);
    }
  });

  it('assumes no size run for any garment', () => {
    const sizeAxis = seedProducts.flatMap((product) =>
      product.options.filter((option) => /size/i.test(option.name)),
    );
    expect(sizeAxis).toEqual([]);
  });

  it('leaves unverifiable copy absent rather than filling it in', () => {
    for (const product of seedProducts) {
      expect(product.description, product.slug).toBeNull();
      expect(product.tagline, product.slug).toBeNull();
      expect(product.publishedAt, product.slug).toBeNull();
      expect(Object.values(product.specification).every((value) => value === null)).toBe(true);
    }
  });

  it('keeps every piece buyable — a variant, in stock, and reachable', () => {
    for (const product of seedProducts) {
      expect(product.variants.length, product.slug).toBeGreaterThan(0);
      expect(productAvailability(product), product.slug).toBe('in_stock');
    }
  });

  it('preserves the storefront merchandising order', () => {
    const ranks = seedProducts.map((product) => product.featuredRank);
    expect(ranks).toEqual([...ranks].sort((a, b) => (a ?? 0) - (b ?? 0)));
    expect(new Set(ranks).size).toBe(ranks.length);
  });

  it('classifies every piece into a catalogue section from its own name', () => {
    // A seed product that lands in no group would be invisible behind every
    // chip except ALL, which is a merchandising bug rather than a data gap.
    for (const product of seedProducts) {
      expect(categoryGroupOf(product), product.slug).not.toBeNull();
    }
  });

  it('references only collections that exist', () => {
    const known = new Set(seedCollections.map((collection) => collection.slug));
    for (const product of seedProducts) {
      for (const slug of product.collectionSlugs) {
        expect(known.has(slug), `${product.slug} -> ${slug}`).toBe(true);
      }
    }
  });

  it('lists every product in its collection', () => {
    expect(seedCollections[0]!.productSlugs).toEqual(seedProducts.map((product) => product.slug));
  });
});
