/**
 * Prepares the throwaway database the browser tests run against.
 *
 * Refuses to run against anything but an embedded `pglite://` database, so it
 * can never write test fixtures into a real one.
 *
 * It loads the real catalogue snapshot, then adds the configuration a store
 * needs before it can sell — which production gets from the owner in the admin:
 * a shipping rate, a tax rate, a discount code, and counted stock on the
 * variants the tests buy.
 */
import { rm } from 'node:fs/promises';
import path from 'node:path';

import { eq } from 'drizzle-orm';

import { products as snapshotProducts } from '../src/data/adapters/local/snapshot';
import { seedCatalog } from '../src/server/commerce/seed';
import { closeDb, databaseUrl, getDb, runMigrations, schema } from '../src/server/db/client';

async function main(): Promise<void> {
  const url = databaseUrl();
  if (!url?.startsWith('pglite://') || url === 'pglite://memory') {
    throw new Error('e2e fixtures only run against an on-disk pglite:// database.');
  }
  // Start from nothing so every run is the same.
  await rm(path.resolve(process.cwd(), url.slice('pglite://'.length)), { recursive: true, force: true });

  await runMigrations();
  await seedCatalog(snapshotProducts, 'e2e');
  const db = await getDb();

  await db.insert(schema.shippingRates).values({
    id: 'shp_e2e_standard',
    name: 'Standard',
    countries: ['CA'],
    priceCents: 1200,
    deliveryEstimate: null,
  });
  await db.insert(schema.taxRates).values({ id: 'tax_e2e_gst', country: 'CA', province: '', name: 'GST', rateBps: 500 });
  await db.insert(schema.discounts).values({
    id: 'dsc_e2e_ten',
    title: 'E2E ten percent',
    kind: 'percentage',
    method: 'code',
    code: 'E2E10',
    percentOff: 10,
    eligibility: { scope: 'all', productSlugs: [], categories: [], excludeSaleItems: false },
  });

  // Give the first in-stock product a real, small stock count so the tests can
  // prove that the last unit sells once and only once.
  const product = snapshotProducts.find((entry) => entry.slug === 'infnitys-iced-raven-tank');
  for (const [index, variant] of (product?.variants ?? []).entries()) {
    await db
      .update(schema.inventoryLevels)
      .set({ tracked: true, onHand: index === 0 ? 1 : 5 })
      .where(eq(schema.inventoryLevels.variantId, variant.id));
  }
  console.log('e2e fixtures ready');
}

main()
  .catch((error) => {
    console.error(`e2e-fixtures: ${(error as Error).message}`);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
