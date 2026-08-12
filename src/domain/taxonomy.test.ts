import { describe, expect, it } from 'vitest';

import { availableGroups, categoryGroupOf, labelForGroup } from './taxonomy';
import { product } from '@/test/fixtures';

/**
 * The taxonomy is what the catalogue chips are built from, so a
 * misclassification is not cosmetic — it hides a product from the section a
 * customer browsed to find it.
 *
 * Every case below uses a real INFNITY product name.
 */
describe('categoryGroupOf', () => {
  it.each([
    ["INFNITY'S Iced Raven Tank", 'tops'],
    ["INFNITY'S Jet-Black Jersey", 'tops'],
    ["INFNI-TEE'S LeCaptain America", 'tops'],
    ["INFNITY'S Varsity Hoodie", 'hoodies'],
    ["INFNITY'S Reversible Obsidian Blank Hoodie", 'hoodies'],
    ["INFNITY'S Signature Ivy-Moss Patchwork Hoodie", 'hoodies'],
    ["INFNITY'S Crew Socks Pack", 'accessories'],
    ["INFNITY'S Sweatpants", 'bottoms'],
  ])('classifies %s as %s', (name, expected) => {
    expect(categoryGroupOf(product({ name, category: null }))).toBe(expected);
  });

  it('prefers a hoodie match over the broader tops rule', () => {
    // "Hooded Long Sleeve" matches both rules; specificity order must win, or
    // every hoodie in the catalogue lands under TOPS.
    expect(categoryGroupOf(product({ name: 'Hooded Long Sleeve', category: null }))).toBe(
      'hoodies',
    );
  });

  it('does not let "short sleeve" fall into bottoms', () => {
    expect(categoryGroupOf(product({ name: 'Short Sleeve Tee', category: null }))).toBe('tops');
  });

  it('trusts the merchandiser-set product type over the marketing name', () => {
    expect(
      categoryGroupOf(product({ name: 'Obsidian Statement Piece', category: 'Hoodies' })),
    ).toBe('hoodies');
  });

  it('returns null rather than guessing when the copy does not say', () => {
    expect(categoryGroupOf(product({ name: 'INFNITY Mystery Drop', category: null }))).toBeNull();
  });
});

describe('availableGroups', () => {
  it('lists only groups the catalogue actually contains', () => {
    const groups = availableGroups([
      product({ slug: 'a', name: "INFNITY'S Iced Raven Tank", category: null }),
      product({ slug: 'b', name: "INFNITY'S Crew Socks Pack", category: null }),
    ]);
    expect(groups.map((group) => group.id)).toEqual(['tops', 'accessories']);
  });

  it('orders chips for merchandising, not for matching specificity', () => {
    // The classifier tests hoodies before tops; the chips must still read
    // TOPS then HOODIES.
    const groups = availableGroups([
      product({ slug: 'a', name: "INFNITY'S Varsity Hoodie", category: null }),
      product({ slug: 'b', name: "INFNITY'S Iced Raven Tank", category: null }),
    ]);
    expect(groups.map((group) => group.id)).toEqual(['tops', 'hoodies']);
  });

  it('returns nothing for an unclassifiable catalogue rather than every chip', () => {
    expect(availableGroups([product({ name: 'Unnamed Piece', category: null })])).toEqual([]);
  });
});

describe('labelForGroup', () => {
  it('gives a display label for each group', () => {
    expect(labelForGroup('tops')).toBe('Tops');
    expect(labelForGroup('accessories')).toBe('Accessories');
  });
});
