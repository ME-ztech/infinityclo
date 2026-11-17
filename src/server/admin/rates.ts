/**
 * Shipping rates and tax rates — the two tables checkout prices against.
 *
 * Neither is pre-filled. The store's real carrier prices and its tax
 * registrations are facts only the owner knows, so both tables start empty and
 * the consequences are stated rather than papered over:
 *
 *   no active shipping rate   checkout is closed (see `checkoutReadiness`).
 *   no tax rate               no tax is charged — correct for a business that
 *                             is not registered to collect it, and wrong for
 *                             one that is.
 *
 * Parsing and validation are pure functions (unit-tested); the database calls
 * are thin wrappers around them.
 */
import 'server-only';

import { asc, eq } from 'drizzle-orm';

import { getDb, schema } from '../db/client';
import { newId } from '../db/ids';

const { shippingRates, taxRates } = schema;

export type ShippingRateRow = typeof shippingRates.$inferSelect;
export type TaxRateRow = typeof taxRates.$inferSelect;

export class RateValidationError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(problems.join(' '));
    this.name = 'RateValidationError';
  }
}

export interface ShippingRateInput {
  readonly name: string;
  readonly countries: string[];
  readonly provinces: string[];
  readonly priceCents: number;
  readonly freeOverCents: number | null;
  readonly deliveryEstimate: string | null;
  readonly active: boolean;
  readonly position: number;
}

export interface TaxRateInput {
  readonly country: string;
  readonly province: string;
  readonly name: string;
  readonly rateBps: number;
  readonly appliesToShipping: boolean;
  readonly active: boolean;
}

const text = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';

const codes = (value: unknown): string[] => [
  ...new Set(
    text(value, 600)
      .split(/[,\s]+/)
      .map((entry) => entry.trim().toUpperCase())
      .filter(Boolean),
  ),
];

/** `"15"`, `"15.5"`, `"$15.50"` -> cents. Null when empty; NaN when malformed. */
export function dollarsToCents(value: unknown): number | null {
  const raw = text(value, 20).replace(/^\$/, '');
  if (!raw) return null;
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(raw)) return Number.NaN;
  return Math.round(Number(raw) * 100);
}

/** `"5"`, `"9.975"` percent -> basis points. NaN when malformed. */
export function percentToBps(value: unknown): number {
  const raw = text(value, 12).replace(/%$/, '');
  if (!/^\d{1,2}(\.\d{1,3})?$/.test(raw)) return Number.NaN;
  // Work in thousandths of a percent to avoid float drift, then round to bps.
  const [whole = '0', fraction = ''] = raw.split('.');
  const thousandths = Number(whole) * 1000 + Number(fraction.padEnd(3, '0'));
  return Math.round(thousandths / 10);
}

export function parseShippingRate(input: Record<string, unknown>): ShippingRateInput {
  const problems: string[] = [];
  const name = text(input.name, 80);
  if (!name) problems.push('Give the shipping rate a name customers will recognise, for example “Standard”.');

  const countries = codes(input.countries);
  if (countries.length === 0) problems.push('Enter at least one country code, or * for anywhere.');
  else if (countries.includes('*') && countries.length > 1) problems.push('Use * on its own, not together with country codes.');
  else if (countries.some((code) => code !== '*' && !/^[A-Z]{2}$/.test(code))) {
    problems.push('Country codes are two letters, for example CA or US.');
  }

  const provinces = codes(input.provinces);
  if (provinces.some((code) => !/^[A-Z0-9]{1,3}$/.test(code))) problems.push('Province codes are short codes such as MB or ON.');
  if (provinces.length > 0 && (countries.length !== 1 || countries[0] === '*')) {
    problems.push('Provinces can only be listed when the rate is for exactly one country.');
  }

  const priceCents = dollarsToCents(input.price);
  if (priceCents === null || Number.isNaN(priceCents)) problems.push('Enter the price in dollars, for example 15 or 15.50. Use 0 for free shipping.');

  const freeOverCents = dollarsToCents(input.freeOver);
  if (freeOverCents !== null && (Number.isNaN(freeOverCents) || freeOverCents <= 0)) {
    problems.push('“Free over” must be an amount in dollars greater than zero, or left empty.');
  }

  const positionRaw = text(input.position, 6);
  const position = positionRaw ? Number(positionRaw) : 0;
  if (!Number.isInteger(position) || position < 0 || position > 9999) problems.push('Display order must be a whole number from 0 to 9999.');

  if (problems.length) throw new RateValidationError(problems);
  return {
    name,
    countries,
    provinces,
    priceCents: priceCents!,
    freeOverCents,
    deliveryEstimate: text(input.deliveryEstimate, 120) || null,
    active: input.active === true || input.active === 'on' || input.active === 'true',
    position,
  };
}

export function parseTaxRate(input: Record<string, unknown>): TaxRateInput {
  const problems: string[] = [];
  const country = text(input.country, 10).toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) problems.push('Enter a two-letter country code, for example CA.');
  const province = text(input.province, 10).toUpperCase();
  if (province && !/^[A-Z0-9]{1,3}$/.test(province)) problems.push('The province is a short code such as MB, or left empty for the whole country.');
  const name = text(input.name, 40);
  if (!name) problems.push('Name the tax as it should appear on the order, for example GST.');
  const rateBps = percentToBps(input.rate);
  if (Number.isNaN(rateBps) || rateBps < 0 || rateBps > 5000) problems.push('Enter the rate as a percentage between 0 and 50, for example 5 or 9.975.');
  if (problems.length) throw new RateValidationError(problems);
  return {
    country,
    province,
    name,
    rateBps,
    appliesToShipping: input.appliesToShipping === true || input.appliesToShipping === 'on' || input.appliesToShipping === 'true',
    active: input.active === true || input.active === 'on' || input.active === 'true',
  };
}

/* ------------------------------------------------------------------ *
 * Shipping
 * ------------------------------------------------------------------ */

export async function listShippingRates(): Promise<ShippingRateRow[]> {
  const db = await getDb();
  return db.select().from(shippingRates).orderBy(asc(shippingRates.position), asc(shippingRates.priceCents));
}

export async function createShippingRate(input: Record<string, unknown>): Promise<ShippingRateRow> {
  const values = parseShippingRate(input);
  const db = await getDb();
  const [created] = await db.insert(shippingRates).values({ id: newId('shp'), ...values }).returning();
  return created!;
}

export async function updateShippingRate(id: string, input: Record<string, unknown>): Promise<ShippingRateRow> {
  const values = parseShippingRate(input);
  const db = await getDb();
  const [updated] = await db
    .update(shippingRates)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(shippingRates.id, id))
    .returning();
  if (!updated) throw new Error('Shipping rate not found.');
  return updated;
}

export async function deleteShippingRate(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(shippingRates).where(eq(shippingRates.id, id));
}

/* ------------------------------------------------------------------ *
 * Tax
 * ------------------------------------------------------------------ */

export async function listTaxRates(): Promise<TaxRateRow[]> {
  const db = await getDb();
  return db.select().from(taxRates).orderBy(asc(taxRates.country), asc(taxRates.province), asc(taxRates.name));
}

export async function createTaxRate(input: Record<string, unknown>): Promise<TaxRateRow> {
  const values = parseTaxRate(input);
  const db = await getDb();
  const [created] = await db.insert(taxRates).values({ id: newId('tax'), ...values }).returning();
  return created!;
}

export async function updateTaxRate(id: string, input: Record<string, unknown>): Promise<TaxRateRow> {
  const values = parseTaxRate(input);
  const db = await getDb();
  const [updated] = await db
    .update(taxRates)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(taxRates.id, id))
    .returning();
  if (!updated) throw new Error('Tax rate not found.');
  return updated;
}

export async function deleteTaxRate(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(taxRates).where(eq(taxRates.id, id));
}
