import { describe, expect, it } from 'vitest';

import { CART_STORAGE_KEY, readPersistedCart, writePersistedCart } from './storage';

describe('cart storage', () => {
  it('round-trips a cart', () => {
    writePersistedCart({
      id: 'cart-1',
      lines: [{ productSlug: 'piece', variantId: 'v1', quantity: 2 }],
      updatedAt: '2026-08-12T00:00:00.000Z',
    });

    expect(readPersistedCart()?.lines).toEqual([
      { productSlug: 'piece', variantId: 'v1', quantity: 2 },
    ]);
  });

  it('returns null when nothing is stored', () => {
    expect(readPersistedCart()).toBeNull();
  });

  it('discards malformed JSON instead of throwing', () => {
    window.localStorage.setItem(CART_STORAGE_KEY, '{ not json');
    expect(readPersistedCart()).toBeNull();
  });

  it('drops individual malformed lines but keeps valid ones', () => {
    window.localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify({
        id: 'cart-1',
        lines: [
          { productSlug: 'good', variantId: 'v1', quantity: 1 },
          { productSlug: 'no-variant' },
          { productSlug: 'bad-qty', variantId: 'v2', quantity: 0 },
          { productSlug: 'fractional', variantId: 'v3', quantity: 1.5 },
        ],
        updatedAt: '2026-08-12T00:00:00.000Z',
      }),
    );

    expect(readPersistedCart()?.lines).toEqual([
      { productSlug: 'good', variantId: 'v1', quantity: 1 },
    ]);
  });

  it('rejects a stored cart with no lines array', () => {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ id: 'cart-1' }));
    expect(readPersistedCart()).toBeNull();
  });

  it('stores no prices, so a tampered value cannot set what something costs', () => {
    writePersistedCart({
      id: 'cart-1',
      lines: [{ productSlug: 'piece', variantId: 'v1', quantity: 1 }],
      updatedAt: '2026-08-12T00:00:00.000Z',
    });

    const raw = window.localStorage.getItem(CART_STORAGE_KEY) ?? '';
    expect(raw).not.toMatch(/price|amount|subtotal/i);
  });
});
