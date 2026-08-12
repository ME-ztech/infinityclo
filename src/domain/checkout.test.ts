import { describe, expect, it } from 'vitest';

import { checkoutAvailability } from './checkout';
import { money } from './money';
import type { Cart, CartLine } from './types';

function line(overrides: Partial<CartLine> = {}): CartLine {
  return {
    id: 'line-1',
    productSlug: 'piece',
    variantId: 'v1',
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

describe('checkout boundary', () => {
  it('is unavailable whenever no payment provider is connected', () => {
    // The central guarantee of Phase 1: a full cart still cannot check out.
    expect(checkoutAvailability(cart([line()]), false)).toEqual({
      status: 'unavailable',
      reason: 'not_implemented',
    });
  });

  it('reports not_implemented ahead of any other reason', () => {
    // Even an empty cart must not suggest that filling it would enable checkout.
    expect(checkoutAvailability(cart([]), false).status).toBe('unavailable');
    expect(checkoutAvailability(cart([]), false)).toMatchObject({ reason: 'not_implemented' });
  });

  it('blocks an empty cart once payments are enabled', () => {
    expect(checkoutAvailability(cart([]), true)).toEqual({
      status: 'unavailable',
      reason: 'empty_cart',
    });
  });

  it('blocks a cart containing a sold-out line', () => {
    expect(checkoutAvailability(cart([line({ availability: 'sold_out' })]), true)).toEqual({
      status: 'unavailable',
      reason: 'items_unavailable',
    });
  });

  it('blocks a cart containing an archived line', () => {
    expect(checkoutAvailability(cart([line({ availability: 'archived' })]), true)).toEqual({
      status: 'unavailable',
      reason: 'items_unavailable',
    });
  });

  it('allows a valid cart once payments are enabled', () => {
    expect(checkoutAvailability(cart([line()]), true)).toEqual({ status: 'available' });
  });
});
