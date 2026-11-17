// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';

import { useMemoryDatabaseForTesting } from '../db/client';

import {
  RateValidationError,
  createShippingRate,
  createTaxRate,
  deleteShippingRate,
  deleteTaxRate,
  dollarsToCents,
  listShippingRates,
  listTaxRates,
  parseShippingRate,
  parseTaxRate,
  percentToBps,
  updateShippingRate,
  updateTaxRate,
} from './rates';

const shipping = (overrides: Record<string, unknown> = {}) => ({
  name: 'Standard',
  countries: 'ca',
  provinces: '',
  price: '15',
  freeOver: '',
  deliveryEstimate: '',
  position: '',
  active: true,
  ...overrides,
});

const tax = (overrides: Record<string, unknown> = {}) => ({
  country: 'ca',
  province: '',
  name: 'GST',
  rate: '5',
  appliesToShipping: true,
  active: true,
  ...overrides,
});

const problemsOf = (run: () => unknown): string[] => {
  try {
    run();
  } catch (error) {
    if (error instanceof RateValidationError) return [...error.problems];
    throw error;
  }
  return [];
};

describe('money and percentage parsing', () => {
  it('converts dollars to whole cents', () => {
    expect(dollarsToCents('15')).toBe(1500);
    expect(dollarsToCents('15.5')).toBe(1550);
    expect(dollarsToCents('$0.99')).toBe(99);
    expect(dollarsToCents('0')).toBe(0);
    expect(dollarsToCents('')).toBeNull();
  });

  it('rejects anything that is not a plain amount', () => {
    for (const bad of ['-5', '1.234', 'abc', '1e3', '15,00']) expect(dollarsToCents(bad)).toBeNaN();
  });

  it('converts percentages to basis points without float drift', () => {
    expect(percentToBps('5')).toBe(500);
    expect(percentToBps('13')).toBe(1300);
    expect(percentToBps('9.975')).toBe(998);
    expect(percentToBps('7%')).toBe(700);
    expect(percentToBps('0')).toBe(0);
    expect(percentToBps('abc')).toBeNaN();
    expect(percentToBps('-1')).toBeNaN();
  });
});

describe('parseShippingRate', () => {
  it('normalises a valid rate', () => {
    expect(parseShippingRate(shipping({ countries: 'ca, us', price: '12.50', freeOver: '150', deliveryEstimate: ' 3–5 business days ', position: '2' }))).toEqual({
      name: 'Standard',
      countries: ['CA', 'US'],
      provinces: [],
      priceCents: 1250,
      freeOverCents: 15000,
      deliveryEstimate: '3–5 business days',
      active: true,
      position: 2,
    });
  });

  it('accepts * for anywhere and a zero price', () => {
    const rate = parseShippingRate(shipping({ countries: '*', price: '0' }));
    expect(rate.countries).toEqual(['*']);
    expect(rate.priceCents).toBe(0);
  });

  it('requires a name, a destination and a price', () => {
    const problems = problemsOf(() => parseShippingRate(shipping({ name: ' ', countries: '', price: '' })));
    expect(problems).toHaveLength(3);
  });

  it('rejects malformed country codes and * mixed with codes', () => {
    expect(problemsOf(() => parseShippingRate(shipping({ countries: 'Canada' })))[0]).toMatch(/two letters/);
    expect(problemsOf(() => parseShippingRate(shipping({ countries: '*, CA' })))[0]).toMatch(/on its own/);
  });

  it('only allows provinces on a single-country rate', () => {
    expect(parseShippingRate(shipping({ provinces: 'mb, sk' })).provinces).toEqual(['MB', 'SK']);
    expect(problemsOf(() => parseShippingRate(shipping({ countries: 'CA, US', provinces: 'MB' })))[0]).toMatch(/exactly one country/);
    expect(problemsOf(() => parseShippingRate(shipping({ countries: '*', provinces: 'MB' })))[0]).toMatch(/exactly one country/);
  });

  it('rejects a negative price, a bad threshold and a bad order', () => {
    expect(problemsOf(() => parseShippingRate(shipping({ price: '-1' })))).toHaveLength(1);
    expect(problemsOf(() => parseShippingRate(shipping({ freeOver: '0' })))).toHaveLength(1);
    expect(problemsOf(() => parseShippingRate(shipping({ position: '1.5' })))).toHaveLength(1);
  });

  it('treats an unticked box as inactive', () => {
    expect(parseShippingRate(shipping({ active: false })).active).toBe(false);
    expect(parseShippingRate(shipping({ active: 'on' })).active).toBe(true);
  });
});

describe('parseTaxRate', () => {
  it('normalises a valid rate', () => {
    expect(parseTaxRate(tax({ province: 'mb', name: 'RST', rate: '7', appliesToShipping: false }))).toEqual({
      country: 'CA',
      province: 'MB',
      name: 'RST',
      rateBps: 700,
      appliesToShipping: false,
      active: true,
    });
  });

  it('requires a country, a name and a rate between 0 and 50 percent', () => {
    expect(problemsOf(() => parseTaxRate(tax({ country: 'CAN' })))).toHaveLength(1);
    expect(problemsOf(() => parseTaxRate(tax({ name: '' })))).toHaveLength(1);
    expect(problemsOf(() => parseTaxRate(tax({ rate: '51' })))).toHaveLength(1);
    expect(problemsOf(() => parseTaxRate(tax({ rate: 'five' })))).toHaveLength(1);
    expect(parseTaxRate(tax({ rate: '50' })).rateBps).toBe(5000);
  });
});

describe('rates in the database', () => {
  beforeEach(async () => {
    await useMemoryDatabaseForTesting();
  });

  it('starts empty: nothing is pre-filled', async () => {
    expect(await listShippingRates()).toEqual([]);
    expect(await listTaxRates()).toEqual([]);
  });

  it('creates, updates, orders and deletes shipping rates', async () => {
    const express = await createShippingRate(shipping({ name: 'Express', price: '30', position: '2' }));
    const standard = await createShippingRate(shipping({ position: '1' }));
    expect((await listShippingRates()).map((rate) => rate.name)).toEqual(['Standard', 'Express']);

    const updated = await updateShippingRate(standard.id, shipping({ price: '18', active: false }));
    expect(updated).toMatchObject({ priceCents: 1800, active: false });

    await deleteShippingRate(express.id);
    expect(await listShippingRates()).toHaveLength(1);
    await expect(updateShippingRate('shp_missing', shipping())).rejects.toThrow('not found');
  });

  it('writes nothing when validation fails', async () => {
    await expect(createShippingRate(shipping({ price: 'free' }))).rejects.toBeInstanceOf(RateValidationError);
    await expect(createTaxRate(tax({ rate: '99' }))).rejects.toBeInstanceOf(RateValidationError);
    expect(await listShippingRates()).toEqual([]);
    expect(await listTaxRates()).toEqual([]);
  });

  it('creates, updates and deletes tax rates', async () => {
    const gst = await createTaxRate(tax());
    await createTaxRate(tax({ name: 'RST', province: 'MB', rate: '7', appliesToShipping: false }));
    expect(await listTaxRates()).toHaveLength(2);
    expect((await updateTaxRate(gst.id, tax({ rate: '5', active: false }))).active).toBe(false);
    await deleteTaxRate(gst.id);
    expect((await listTaxRates()).map((rate) => rate.name)).toEqual(['RST']);
  });
});
