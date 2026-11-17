import { describe, expect, it } from 'vitest';

import { buildCheckoutUrl, checkoutAvailability } from './checkout';
import { money } from './money';
import type { Cart, CartLine } from './types';

function line(overrides: Partial<CartLine> = {}): CartLine {
  return {
    id: 'line-1',
    productSlug: 'piece',
    variantId: '51497122169052',
    quantity: 1,
    productName: 'Piece',
    variantTitle: 'M',
    unitPrice: money(8500),
    compareAtUnitPrice: null,
    media: null,
    availability: 'in_stock',
    ...overrides,
  };
}

function cart(lines: CartLine[]): Cart {
  return {
    id: 'cart-1',
    lines,
    currency: 'CAD',
    subtotal: money(lines.length * 8500),
    updatedAt: '2026-08-12T00:00:00.000Z',
  };
}

describe('checkoutAvailability', () => {
  it('is available for a cart of purchasable lines', () => {
    expect(checkoutAvailability(cart([line()]), true)).toEqual({ status: 'available' });
  });

  it('is unavailable when checkout is switched off', () => {
    expect(checkoutAvailability(cart([line()]), false)).toEqual({
      status: 'unavailable',
      reason: 'disabled',
    });
  });

  it('refuses an empty cart', () => {
    expect(checkoutAvailability(cart([]), true)).toEqual({
      status: 'unavailable',
      reason: 'empty_cart',
    });
  });

  it('refuses a cart holding a sold-out or archived line', () => {
    for (const availability of ['sold_out', 'archived'] as const) {
      expect(checkoutAvailability(cart([line(), line({ id: 'l2', availability })]), true)).toEqual({
        status: 'unavailable',
        reason: 'items_unavailable',
      });
    }
  });
});

describe('buildCheckoutUrl', () => {
  const checkoutDomain = 'example.myshopify.com';

  it('builds a Shopify cart permalink from variant ids and quantities', () => {
    const url = buildCheckoutUrl({
      checkoutDomain,
      lines: [
        { variantId: '51497122169052', quantity: 2 },
        { variantId: '51496288223452', quantity: 1 },
      ],
    });
    expect(url).toBe('https://example.myshopify.com/cart/51497122169052:2,51496288223452:1');
  });

  it('merges repeated variants so no quantity is lost', () => {
    const url = buildCheckoutUrl({
      checkoutDomain,
      lines: [
        { variantId: '51497122169052', quantity: 1 },
        { variantId: '51497122169052', quantity: 3 },
      ],
    });
    expect(url).toBe('https://example.myshopify.com/cart/51497122169052:4');
  });

  it('carries a well-formed discount code and drops a malformed one', () => {
    const lines = [{ variantId: '51497122169052', quantity: 1 }];
    expect(buildCheckoutUrl({ checkoutDomain, lines, discountCode: 'TROOP10' })).toContain(
      '?discount=TROOP10',
    );
    expect(buildCheckoutUrl({ checkoutDomain, lines, discountCode: 'bad code&x=1' })).not.toContain(
      'discount',
    );
  });

  it('throws on anything that is not a numeric variant id', () => {
    expect(() =>
      buildCheckoutUrl({ checkoutDomain, lines: [{ variantId: '1:99,2', quantity: 1 }] }),
    ).toThrow(/variant id/);
    expect(() =>
      buildCheckoutUrl({ checkoutDomain, lines: [{ variantId: 'v-m', quantity: 1 }] }),
    ).toThrow(/variant id/);
  });

  it('throws on a non-positive or absurd quantity', () => {
    for (const quantity of [0, -1, 1.5, 100]) {
      expect(() =>
        buildCheckoutUrl({ checkoutDomain, lines: [{ variantId: '51497122169052', quantity }] }),
      ).toThrow(/Quantity/);
    }
  });

  it('throws on an empty cart or an invalid host', () => {
    expect(() => buildCheckoutUrl({ checkoutDomain, lines: [] })).toThrow(/empty/);
    expect(() =>
      buildCheckoutUrl({
        checkoutDomain: 'evil.example/path?x=',
        lines: [{ variantId: '51497122169052', quantity: 1 }],
      }),
    ).toThrow(/host/);
  });
});
