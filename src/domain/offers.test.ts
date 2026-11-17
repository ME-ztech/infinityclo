import { describe, expect, it } from 'vitest';

import { product as productFixture } from '@/test/fixtures';

import { money } from './money';
import {
  automaticEstimates,
  describeOffer,
  estimateOffer,
  isOfferActive,
  validateOffer,
  type Offer,
  type OfferInput,
} from './offers';
import type { CartLine, Product } from './types';

function input(overrides: Partial<OfferInput> = {}): OfferInput {
  return {
    kind: 'percentage',
    title: 'Ten percent',
    method: 'code',
    code: 'TROOP10',
    percentOff: 10,
    minQuantity: null,
    audience: 'everyone',
    eligibility: { scope: 'all', productSlugs: [], categories: [], excludeSaleItems: false },
    startsAt: null,
    endsAt: null,
    usageLimit: null,
    oncePerCustomer: false,
    combinesWith: { productDiscounts: false, orderDiscounts: false, shippingDiscounts: true },
    showOnStorefront: true,
    internalNote: '',
    ...overrides,
  };
}

function offer(overrides: Partial<Offer> = {}): Offer {
  return {
    ...input(),
    id: 'off_1',
    status: 'live',
    marginCheckedBy: 'owner@example.com',
    discountId: 'gid://shopify/DiscountCodeNode/1',
    sandbox: false,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    createdBy: 'owner@example.com',
    activatedAt: '2026-11-01T00:00:00.000Z',
    activatedBy: 'owner@example.com',
    ...overrides,
  };
}

function line(overrides: Partial<CartLine> = {}): CartLine {
  return {
    id: 'l1',
    productSlug: 'hoodie',
    variantId: '111111',
    quantity: 1,
    productName: 'Hoodie',
    variantTitle: 'M',
    unitPrice: money(6000),
    compareAtUnitPrice: null,
    media: null,
    availability: 'in_stock',
    ...overrides,
  };
}

const catalogue = new Map<string, Product>([
  ['hoodie', productFixture({ slug: 'hoodie', name: 'Blank Hoodie', category: 'Hoodies' })],
  ['tee', productFixture({ slug: 'tee', name: 'Graphic Tee', category: null })],
]);

describe('validateOffer', () => {
  it('accepts a well-formed percentage code', () => {
    expect(validateOffer(input())).toEqual([]);
  });

  it('rejects out-of-range percentages and malformed codes', () => {
    expect(validateOffer(input({ percentOff: 0 }))).toContain('Percent off must be between 1 and 90.');
    expect(validateOffer(input({ percentOff: 95 }))).toContain('Percent off must be between 1 and 90.');
    expect(validateOffer(input({ code: 'no spaces allowed' })).length).toBe(1);
  });

  it('requires a bundle to be automatic with a minimum quantity of at least 2', () => {
    const problems = validateOffer(input({ kind: 'bundle', minQuantity: 1 }));
    expect(problems.some((problem) => problem.includes('minimum quantity'))).toBe(true);
    expect(problems.some((problem) => problem.includes('automatically'))).toBe(true);
    expect(
      validateOffer(input({ kind: 'bundle', method: 'automatic', code: null, minQuantity: 2 })),
    ).toEqual([]);
  });

  it('requires a first-order offer to use a code', () => {
    expect(
      validateOffer(input({ audience: 'first_order', method: 'automatic', code: null })),
    ).toContain(
      'A first-order offer must use a code, because checkout has to recognise the customer.',
    );
  });

  it('rejects an end date that is not after the start date', () => {
    expect(
      validateOffer(input({ startsAt: '2026-12-02T00:00:00Z', endsAt: '2026-12-01T00:00:00Z' })),
    ).toContain('The end date must be after the start date.');
  });

  it('requires a target when eligibility is scoped', () => {
    expect(
      validateOffer(
        input({
          eligibility: { scope: 'products', productSlugs: [], categories: [], excludeSaleItems: false },
        }),
      ),
    ).toContain('Choose at least one eligible product.');
  });
});

describe('isOfferActive', () => {
  const now = new Date('2026-11-16T12:00:00Z');

  it('is never active while draft, paused or ended', () => {
    for (const status of ['draft', 'paused', 'ended'] as const) {
      expect(isOfferActive(offer({ status }), now)).toBe(false);
    }
  });

  it('respects the date window', () => {
    expect(isOfferActive(offer({ startsAt: '2026-11-17T00:00:00Z' }), now)).toBe(false);
    expect(isOfferActive(offer({ endsAt: '2026-11-16T11:59:00Z' }), now)).toBe(false);
    expect(
      isOfferActive(offer({ startsAt: '2026-11-01T00:00:00Z', endsAt: '2026-12-01T00:00:00Z' }), now),
    ).toBe(true);
  });
});

describe('estimateOffer', () => {
  it('takes the percentage off every eligible line, rounded to the cent per line', () => {
    const estimate = estimateOffer(
      offer({ percentOff: 10 }),
      [line({ unitPrice: money(2999), quantity: 1 }), line({ id: 'l2', unitPrice: money(4598), quantity: 2 })],
      catalogue,
    );
    // 10% of 29.99 = 2.999 -> 3.00; 10% of 91.96 = 9.196 -> 9.20
    expect(estimate.applies).toBe(true);
    expect(estimate.savings).toEqual(money(300 + 920));
    expect(estimate.eligibleSubtotal).toEqual(money(2999 + 9196));
  });

  it('skips sale items when the offer excludes them', () => {
    const estimate = estimateOffer(
      offer({
        eligibility: { scope: 'all', productSlugs: [], categories: [], excludeSaleItems: true },
      }),
      [line({ compareAtUnitPrice: money(9000) }), line({ id: 'l2', unitPrice: money(5000) })],
      catalogue,
    );
    expect(estimate.eligibleQuantity).toBe(1);
    expect(estimate.savings).toEqual(money(500));
  });

  it('never discounts a sold-out line', () => {
    const estimate = estimateOffer(offer(), [line({ availability: 'sold_out' })], catalogue);
    expect(estimate.applies).toBe(false);
    expect(estimate.savings).toEqual(money(0));
  });

  it('limits a product-scoped offer to its products', () => {
    const estimate = estimateOffer(
      offer({
        eligibility: { scope: 'products', productSlugs: ['tee'], categories: [], excludeSaleItems: false },
      }),
      [line(), line({ id: 'l2', productSlug: 'tee', unitPrice: money(4500) })],
      catalogue,
    );
    expect(estimate.eligibleQuantity).toBe(1);
    expect(estimate.savings).toEqual(money(450));
  });

  it('limits a category-scoped offer using the product taxonomy', () => {
    const estimate = estimateOffer(
      offer({
        eligibility: { scope: 'categories', productSlugs: [], categories: ['hoodies'], excludeSaleItems: false },
      }),
      [line(), line({ id: 'l2', productSlug: 'tee', unitPrice: money(4500) })],
      catalogue,
    );
    expect(estimate.eligibleQuantity).toBe(1);
    expect(estimate.savings).toEqual(money(600));
  });

  describe('bundles', () => {
    const bundle = offer({ kind: 'bundle', method: 'automatic', code: null, minQuantity: 2, percentOff: 15 });

    it('does not apply below the minimum quantity and reports the shortfall', () => {
      const estimate = estimateOffer(bundle, [line()], catalogue);
      expect(estimate.applies).toBe(false);
      expect(estimate.savings).toEqual(money(0));
      expect(estimate.unitsShort).toBe(1);
    });

    it('applies across lines once the eligible quantity is reached', () => {
      const estimate = estimateOffer(
        bundle,
        [line(), line({ id: 'l2', productSlug: 'tee', unitPrice: money(4500) })],
        catalogue,
      );
      expect(estimate.applies).toBe(true);
      expect(estimate.savings).toEqual(money(900 + 675));
      expect(estimate.unitsShort).toBe(0);
    });

    it('counts quantity, not line count', () => {
      expect(estimateOffer(bundle, [line({ quantity: 2 })], catalogue).applies).toBe(true);
    });
  });
});

describe('automaticEstimates', () => {
  const now = new Date('2026-11-16T12:00:00Z');

  it('surfaces only live automatic offers open to everyone', () => {
    const offers = [
      offer({ id: 'draft', status: 'draft', method: 'automatic', code: null }),
      offer({ id: 'code', method: 'code' }),
      offer({ id: 'first', audience: 'first_order' }),
      offer({ id: 'auto', method: 'automatic', code: null, percentOff: 20 }),
    ];
    const estimates = automaticEstimates(offers, [line()], catalogue, now);
    expect(estimates.map((estimate) => estimate.offer.id)).toEqual(['auto']);
    expect(estimates[0]!.savings).toEqual(money(1200));
  });
});

describe('describeOffer', () => {
  it('describes each shape in plain language', () => {
    expect(describeOffer(offer())).toBe('10% off with code TROOP10');
    expect(describeOffer(offer({ audience: 'first_order' }))).toBe(
      '10% off your first order with code TROOP10',
    );
    expect(
      describeOffer(offer({ kind: 'bundle', method: 'automatic', code: null, minQuantity: 2, percentOff: 15 })),
    ).toBe('15% off when you buy 2 or more');
  });
});
