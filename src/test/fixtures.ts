/**
 * Test fixtures.
 *
 * These are **development-only test data** and are never served by the
 * storefront. The committed catalog snapshot is empty and stays empty until the
 * real INFNITY catalog is imported; nothing in this file reaches a rendered
 * page. Names here are deliberately generic so that if one ever did leak into a
 * build it would be obvious rather than passing for real product copy.
 */
import type { Collection, Product, ProductMedia, ProductVariant } from '@/domain/types';

export function media(overrides: Partial<ProductMedia> = {}): ProductMedia {
  return {
    id: 'media-1',
    url: '/assets/test/shot.jpg',
    alt: 'Test shot',
    kind: 'product',
    width: 800,
    height: 1000,
    position: 1,
    sourceUrl: null,
    ...overrides,
  };
}

export function variant(overrides: Partial<ProductVariant> = {}): ProductVariant {
  return {
    id: 'variant-1',
    sku: null,
    title: 'M / Black',
    price: { amount: 8500, currency: 'CAD' },
    compareAtPrice: null,
    availability: 'in_stock',
    selectedOptions: { Size: 'M', Colour: 'Black' },
    mediaId: null,
    ...overrides,
  };
}

export function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'product-1',
    slug: 'test-piece',
    name: 'Test Piece',
    tagline: null,
    description: 'A test description.',
    category: 'Hoodies',
    collectionSlugs: ['test-collection'],
    options: [
      { id: 'opt-size', name: 'Size', position: 1, values: ['S', 'M', 'L'] },
      { id: 'opt-colour', name: 'Colour', position: 2, values: ['Black', 'Bone'] },
    ],
    variants: [
      variant({ id: 'v-s', title: 'S / Black', selectedOptions: { Size: 'S', Colour: 'Black' } }),
      variant({ id: 'v-m', title: 'M / Black', selectedOptions: { Size: 'M', Colour: 'Black' } }),
      variant({
        id: 'v-l',
        title: 'L / Black',
        selectedOptions: { Size: 'L', Colour: 'Black' },
        availability: 'sold_out',
      }),
    ],
    media: [media(), media({ id: 'media-2', position: 2, kind: 'model' })],
    specification: {
      materials: null,
      fit: null,
      care: null,
      construction: null,
      weightGsm: null,
      countryOfOrigin: null,
      modelInfo: null,
    },
    tags: [],
    sizeGuideId: null,
    publishedAt: '2026-08-01T00:00:00.000Z',
    legacyUrl: null,
    featuredRank: null,
    ...overrides,
  };
}

export function collection(overrides: Partial<Collection> = {}): Collection {
  return {
    slug: 'test-collection',
    name: 'Test Collection',
    description: null,
    heroMedia: null,
    dropLabel: null,
    releasedAt: null,
    isArchived: false,
    productSlugs: ['test-piece'],
    legacyUrl: null,
    ...overrides,
  };
}
