import { describe, expect, it } from 'vitest';

import { checkoutAvailability } from './checkout';
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
