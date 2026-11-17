import { describe, expect, it } from 'vitest';

import { buildCartPermalink, checkoutAvailability } from './checkout';
import { money } from './money';
import type { Cart, CartLine } from './types';

function line(overrides: Partial<CartLine> = {}): CartLine {
  return {
    id: 'line-1',
    productSlug: 'piece',
    variantId: '47082909794524',
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
  it('is unavailable when checkout is not connected, however full the cart', () => {
    expect(checkoutAvailability(cart([line()]), 'disabled')).toEqual({
      status: 'unavailable',
      reason: 'not_connected',
    });
  });

  it('refuses an empty cart', () => {
    expect(checkoutAvailability(cart([]), 'storefront')).toEqual({
      status: 'unavailable',
      reason: 'empty_cart',
    });
  });

  it('refuses sold-out and archived lines', () => {
    expect(checkoutAvailability(cart([line({ availability: 'sold_out' })]), 'permalink')).toEqual({
      status: 'unavailable',
      reason: 'items_unavailable',
    });
    expect(
      checkoutAvailability(cart([line({ availability: 'archived' })]), 'storefront').status,
    ).toBe('unavailable');
  });

  it('is available for an in-stock cart in either connected mode', () => {
    expect(checkoutAvailability(cart([line()]), 'storefront')).toEqual({ status: 'available' });
    expect(checkoutAvailability(cart([line()]), 'permalink')).toEqual({ status: 'available' });
  });
});

describe('buildCartPermalink', () => {
  it('builds a Shopify cart permalink from real variant ids and quantities', () => {
    const url = new URL(
      buildCartPermalink('apparelinifinty85.myshopify.com', [
        { variantId: '47082909794524', quantity: 2 },
        { variantId: '51495300563164', quantity: 1 },
      ]),
    );
    expect(url.origin).toBe('https://apparelinifinty85.myshopify.com');
    expect(url.pathname).toBe('/cart/47082909794524:2,51495300563164:1');
    expect(url.searchParams.get('discount')).toBeNull();
  });

  it('pre-applies a discount code when given one', () => {
    const url = new URL(
      buildCartPermalink('shop.example.com', [{ variantId: '1', quantity: 1 }], {
        discountCode: 'WELCOME',
      }),
    );
    expect(url.searchParams.get('discount')).toBe('WELCOME');
  });

  it('rejects anything that is not a numeric Shopify variant id, so nothing can be injected into the path', () => {
    expect(() =>
      buildCartPermalink('shop.example.com', [{ variantId: '1/../../admin', quantity: 1 }]),
    ).toThrow();
    expect(() =>
      buildCartPermalink('shop.example.com', [
        { variantId: 'gid://shopify/ProductVariant/1', quantity: 1 },
      ]),
    ).toThrow();
  });

  it('rejects empty carts and non-positive quantities', () => {
    expect(() => buildCartPermalink('shop.example.com', [])).toThrow();
    expect(() =>
      buildCartPermalink('shop.example.com', [{ variantId: '1', quantity: 0 }]),
    ).toThrow();
  });
});
