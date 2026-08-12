import { describe, expect, it } from 'vitest';

import {
  addMoney,
  discountPercent,
  formatMoney,
  isDiscounted,
  money,
  moneyFromDecimalString,
  multiplyMoney,
} from './money';

describe('money', () => {
  it('parses decimal strings into minor units', () => {
    expect(moneyFromDecimalString('85.00')).toEqual({ amount: 8500, currency: 'CAD' });
    expect(moneyFromDecimalString('9.99')).toEqual({ amount: 999, currency: 'CAD' });
  });

  it('treats an unparseable price as zero rather than NaN', () => {
    // A NaN price would propagate silently through a subtotal and render as
    // "$NaN" in a cart, which is worse than an obvious zero.
    expect(moneyFromDecimalString('')).toEqual({ amount: 0, currency: 'CAD' });
    expect(moneyFromDecimalString('not-a-price')).toEqual({ amount: 0, currency: 'CAD' });
  });

  it('refuses to add mismatched currencies', () => {
    expect(() => addMoney(money(100, 'CAD'), money(100, 'USD'))).toThrow(/Cannot add/);
  });

  it('multiplies without floating point drift', () => {
    expect(multiplyMoney({ amount: 999, currency: 'CAD' }, 3)).toEqual({
      amount: 2997,
      currency: 'CAD',
    });
  });

  it('drops decimals on whole amounts and keeps them otherwise', () => {
    expect(formatMoney({ amount: 8500, currency: 'CAD' })).toBe('$85');
    expect(formatMoney({ amount: 8550, currency: 'CAD' })).toBe('$85.50');
  });

  it('only counts a higher compare-at price as a discount', () => {
    const price = money(8500);
    expect(isDiscounted(price, money(9500))).toBe(true);
    expect(isDiscounted(price, money(8500))).toBe(false);
    expect(isDiscounted(price, money(7500))).toBe(false);
    expect(isDiscounted(price, null)).toBe(false);
  });

  it('computes the discount percentage', () => {
    expect(discountPercent(money(7500), money(10000))).toBe(25);
  });

  it('does not divide by zero on a zero compare-at price', () => {
    expect(discountPercent(money(0), money(0))).toBe(0);
  });
});
