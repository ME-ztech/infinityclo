/**
 * Catalogue from INFNITY's own database.
 *
 * This is what the storefront serves. Two narrow fallbacks keep the site
 * honest when the database is not there to ask:
 *
 *   No database configured (a production build with no DATABASE_URL)
 *       -> the committed snapshot, read-only. The site is browsable and
 *          checkout is closed, which `/api/checkout` enforces separately.
 *
 *   Development or the E2E harness, database empty
 *       -> the snapshot is imported once, so a fresh checkout of the
 *          repository is a working store with no manual step. This never
 *          happens in a real production deployment.
 */
import 'server-only';

import { loadPublicCatalog } from '@/server/commerce/catalog';
import { isCatalogEmpty, seedCatalog } from '@/server/commerce/seed';
import { isDatabaseConfigured } from '@/server/db/client';

import { ArrayCatalogRepository, type CatalogData } from '../local/catalog';
import { collections as snapshotCollections, products as snapshotProducts } from '../local/snapshot';

export type CatalogOrigin = 'database' | 'snapshot';

let origin: CatalogOrigin = 'snapshot';
let autoSeed: Promise<void> | null = null;

/** Which source served the most recent catalogue read. Shown in admin. */
export const catalogOrigin = (): CatalogOrigin => origin;

const mayAutoSeed = (): boolean =>
  process.env.INFNITY_AUTO_SEED !== 'off' &&
  (process.env.NODE_ENV !== 'production' || process.env.INFNITY_E2E === '1');

async function load(): Promise<CatalogData> {
  if (!isDatabaseConfigured()) {
    origin = 'snapshot';
    return { products: snapshotProducts, collections: snapshotCollections };
  }
  try {
    if (mayAutoSeed()) {
      autoSeed ??= (async () => {
        if (await isCatalogEmpty()) await seedCatalog(snapshotProducts, 'auto-seed');
      })();
      await autoSeed;
    }
    const data = await loadPublicCatalog();
    origin = 'database';
    return data;
  } catch (error) {
    // The database is configured but unreachable. Serve the snapshot so the
    // site stays browsable; checkout will refuse, because it needs the database.
    console.error(`[catalog] database read failed, serving read-only snapshot: ${(error as Error).message}`);
    origin = 'snapshot';
    return { products: snapshotProducts, collections: snapshotCollections };
  }
}

export const databaseCatalogRepository = new ArrayCatalogRepository(load);
