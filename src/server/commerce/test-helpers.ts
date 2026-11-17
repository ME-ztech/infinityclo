/**
 * Test fixtures for the commerce engine. Generic names on purpose — nothing
 * here is INFNITY product data and nothing here is ever served.
 */
import { getDb, schema } from '../db/client';

export interface SeededVariant {
  readonly id: string;
  readonly priceCents: number;
}

export async function seedProduct(input: {
  handle: string;
  title?: string;
  productType?: string;
  status?: 'draft' | 'active' | 'archived';
  publishAt?: Date | null;
  preorder?: boolean;
  variants: ReadonlyArray<{
    id: string;
    title?: string;
    priceCents: number;
    compareAtCents?: number | null;
    onHand?: number;
    tracked?: boolean;
  }>;
}): Promise<string> {
  const db = await getDb();
  const productId = `prd_${input.handle}`;
  await db.insert(schema.products).values({
    id: productId,
    handle: input.handle,
    title: input.title ?? input.handle,
    productType: input.productType ?? '',
    status: input.status ?? 'active',
    publishAt: input.publishAt ?? null,
    preorder: input.preorder ?? false,
  });
  await db.insert(schema.productOptions).values({
    id: `opt_${input.handle}`,
    productId,
    name: 'Size',
    position: 1,
    values: input.variants.map((variant) => variant.title ?? variant.id),
  });
  for (const [index, variant] of input.variants.entries()) {
    await db.insert(schema.productVariants).values({
      id: variant.id,
      productId,
      title: variant.title ?? variant.id,
      priceCents: variant.priceCents,
      compareAtCents: variant.compareAtCents ?? null,
      optionValues: { Size: variant.title ?? variant.id },
      position: index + 1,
    });
    await db.insert(schema.inventoryLevels).values({
      variantId: variant.id,
      onHand: variant.onHand ?? 0,
      tracked: variant.tracked ?? true,
    });
  }
  return productId;
}

export async function seedShippingRate(
  overrides: Partial<typeof schema.shippingRates.$inferInsert> = {},
): Promise<string> {
  const db = await getDb();
  const id = overrides.id ?? `shp_${Math.random().toString(36).slice(2, 8)}`;
  await db.insert(schema.shippingRates).values({
    id,
    name: 'Standard',
    countries: ['CA'],
    priceCents: 1500,
    ...overrides,
  });
  return id;
}

export async function seedTaxRate(overrides: Partial<typeof schema.taxRates.$inferInsert> = {}): Promise<void> {
  const db = await getDb();
  await db.insert(schema.taxRates).values({
    id: `tax_${Math.random().toString(36).slice(2, 8)}`,
    country: 'CA',
    province: '',
    name: 'GST',
    rateBps: 500,
    ...overrides,
  });
}

export async function seedDiscount(overrides: Partial<typeof schema.discounts.$inferInsert> = {}): Promise<string> {
  const db = await getDb();
  const id = overrides.id ?? `dsc_${Math.random().toString(36).slice(2, 8)}`;
  await db.insert(schema.discounts).values({
    id,
    title: 'Ten percent',
    kind: 'percentage',
    method: 'code',
    code: 'TEN',
    percentOff: 10,
    eligibility: { scope: 'all', productSlugs: [], categories: [], excludeSaleItems: false },
    ...overrides,
  });
  return id;
}

export const ADDRESS = {
  firstName: 'Test',
  lastName: 'Buyer',
  line1: '1 Example Street',
  line2: '',
  city: 'Winnipeg',
  province: 'MB',
  postalCode: 'R3C 0A1',
  country: 'CA',
  phone: null,
};

export async function levelOf(variantId: string) {
  const db = await getDb();
  const rows = await db.select().from(schema.inventoryLevels);
  return rows.find((row) => row.variantId === variantId)!;
}
