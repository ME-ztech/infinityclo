import type { CurrencyCode, Money } from './types';

export const ZERO_CAD: Money = { amount: 0, currency: 'CAD' };

export function money(amount: number, currency: CurrencyCode = 'CAD'): Money {
  return { amount: Math.round(amount), currency };
}

/** Parses a decimal string such as Shopify's `"85.00"` into minor units. */
export function moneyFromDecimalString(value: string, currency: CurrencyCode = 'CAD'): Money {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return { amount: 0, currency };
  return { amount: Math.round(parsed * 100), currency };
}

export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new Error(`Cannot add ${a.currency} to ${b.currency}`);
  }
  return { amount: a.amount + b.amount, currency: a.currency };
}

export function multiplyMoney(value: Money, factor: number): Money {
  return { amount: Math.round(value.amount * factor), currency: value.currency };
}

/**
 * Formats for display. Whole-dollar amounts drop the decimals — fashion pricing
 * reads as "$85", not "$85.00" — while anything with cents keeps them.
 */
/** Always two decimals ("$45.00"), as the live store and the brief's "ADD TO CART — $XX.XX" show prices. */
export function formatMoney(value: Money, locale = 'en-CA'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: value.currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value.amount / 100);
}

export function isDiscounted(price: Money, compareAt: Money | null): compareAt is Money {
  return compareAt !== null && compareAt.amount > price.amount;
}

export function discountPercent(price: Money, compareAt: Money): number {
  if (compareAt.amount <= 0) return 0;
  return Math.round(((compareAt.amount - price.amount) / compareAt.amount) * 100);
}
