import { describe, expect, it } from 'vitest';

import { product, variant } from '@/test/fixtures';
import {
  defaultVariant,
  findVariant,
  fromPrice,
  isNew,
  isOptionValueAvailable,
  isSoldOut,
  primaryMedia,
  productAvailability,
  relatedProducts,
  secondaryMedia,
  sizeValues,
} from './product';

describe('product derivations', () => {
  it('reports the lowest variant price', () => {
    const item = product({
      variants: [
        variant({ id: 'a', price: { amount: 9500, currency: 'CAD' } }),
        variant({ id: 'b', price: { amount: 8500, currency: 'CAD' } }),
      ],
    });
    expect(fromPrice(item)?.amount).toBe(8500);
  });

  it('picks the cheapest available variant as the default', () => {
    const item = product({
      variants: [
        variant({
          id: 'cheap',
          price: { amount: 5000, currency: 'CAD' },
          availability: 'sold_out',
        }),
        variant({ id: 'next', price: { amount: 7000, currency: 'CAD' } }),
      ],
    });
    // The cheapest overall is sold out, so it must not be preselected.
    expect(defaultVariant(item)?.id).toBe('next');
  });

  it('falls back to a sold-out variant when nothing is available', () => {
    const item = product({
      variants: [variant({ id: 'only', availability: 'sold_out' })],
    });
    expect(defaultVariant(item)?.id).toBe('only');
  });

  it('treats a product as in stock when any variant is', () => {
    const item = product({
      variants: [
        variant({ id: 'a', availability: 'sold_out' }),
        variant({ id: 'b', availability: 'in_stock' }),
      ],
    });
    expect(productAvailability(item)).toBe('in_stock');
    expect(isSoldOut(item)).toBe(false);
  });

  it('is sold out only when every variant is', () => {
    const item = product({
      variants: [
        variant({ id: 'a', availability: 'sold_out' }),
        variant({ id: 'b', availability: 'sold_out' }),
      ],
    });
    expect(isSoldOut(item)).toBe(true);
  });

  it('reports unknown availability rather than guessing when there are no variants', () => {
    expect(productAvailability(product({ variants: [] }))).toBe('unknown');
  });

  it('badges NEW only inside the publication window', () => {
    const now = new Date('2026-08-12T00:00:00.000Z');
    expect(isNew(product({ publishedAt: '2026-08-01T00:00:00.000Z' }), now)).toBe(true);
    expect(isNew(product({ publishedAt: '2026-01-01T00:00:00.000Z' }), now)).toBe(false);
  });

  it('never badges NEW without a real publish date', () => {
    expect(isNew(product({ publishedAt: null }))).toBe(false);
    expect(isNew(product({ publishedAt: 'not-a-date' }))).toBe(false);
  });

  it('does not badge a future-dated product as new', () => {
    const now = new Date('2026-08-12T00:00:00.000Z');
    expect(isNew(product({ publishedAt: '2027-01-01T00:00:00.000Z' }), now)).toBe(false);
  });

  it('orders media and prefers a model shot for the hover image', () => {
    const item = product();
    expect(primaryMedia(item)?.id).toBe('media-1');
    expect(secondaryMedia(item)?.id).toBe('media-2');
  });

  it('has no hover image when there is only one shot', () => {
    const item = product({ media: [product().media[0]!] });
    expect(secondaryMedia(item)).toBeNull();
  });

  it('finds the variant matching a full selection', () => {
    const item = product();
    expect(findVariant(item, { Size: 'M', Colour: 'Black' })?.id).toBe('v-m');
    expect(findVariant(item, { Size: 'XL', Colour: 'Black' })).toBeNull();
  });

  it('marks a sold-out size as unavailable', () => {
    const item = product();
    expect(isOptionValueAvailable(item, 'Size', 'M', { Colour: 'Black' })).toBe(true);
    expect(isOptionValueAvailable(item, 'Size', 'L', { Colour: 'Black' })).toBe(false);
  });

  it('reads size values from the option definition', () => {
    expect(sizeValues(product())).toEqual(['S', 'M', 'L']);
  });

  it('relates products by shared collection and never includes itself', () => {
    const seed = product({ slug: 'a', collectionSlugs: ['drop-1'] });
    const sibling = product({ slug: 'b', collectionSlugs: ['drop-1'] });
    const unrelated = product({ slug: 'c', collectionSlugs: ['drop-2'], category: 'Tees' });

    const related = relatedProducts(seed, [seed, sibling, unrelated]);
    expect(related.map((p) => p.slug)).toEqual(['b']);
  });
});
