/**
 * Database operations.
 *
 *   npm run db:migrate              apply pending migrations
 *   npm run db:seed                 import the catalogue snapshot (idempotent)
 *   npm run db:status               what is in the database, and what is unverified
 *   npm run db:inventory -- <csv>   apply counted stock from an inventory CSV
 *
 * Every command acts on `DATABASE_URL`. With it unset, the embedded development
 * database under ./.data is used — never a remote one — so a command run by
 * accident on a laptop cannot touch production.
 *
 * Inventory CSV columns (header row required, extra columns ignored):
 *   "Variant ID" or "SKU", and "On hand" (or "Available")
 * which matches Shopify's inventory export.
 */
import { readFile } from 'node:fs/promises';

import { sql } from 'drizzle-orm';

import { products as snapshotProducts } from '../src/data/adapters/local/snapshot';
import { importCustomers, importOrders, reconcile } from '../src/server/commerce/migration';
import { importInventoryCounts, seedCatalog, unverifiedStock } from '../src/server/commerce/seed';
import { closeDb, databaseEngine, databaseUrl, getDb, runMigrations } from '../src/server/db/client';

/** Minimal RFC-4180 parser: quoted fields, escaped quotes, CRLF. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  row.push(field);
  if (row.some((value) => value.trim() !== '')) rows.push(row);
  return rows;
}

async function status(): Promise<void> {
  const db = await getDb();
  const count = async (table: string): Promise<number> => {
    const result = await db.execute<{ count: number }>(sql.raw(`SELECT count(*)::int AS count FROM "${table}"`));
    return result.rows[0]?.count ?? 0;
  };
  console.log(`Engine: ${await databaseEngine()}`);
  for (const table of ['products', 'product_variants', 'product_media', 'customers', 'orders', 'discounts', 'shipping_rates', 'tax_rates']) {
    console.log(`  ${table.padEnd(18)} ${await count(table)}`);
  }
  const unverified = await unverifiedStock();
  console.log(
    unverified.length
      ? `\n${unverified.length} variants are selling without a counted quantity (UNVERIFIED). Import an inventory CSV before launch.`
      : '\nEvery sellable variant has a counted quantity.',
  );
}

async function main(): Promise<void> {
  const [command, argument] = process.argv.slice(2);
  const url = databaseUrl();
  if (!url) throw new Error('DATABASE_URL is not set.');
  console.log(`Database: ${url.startsWith('pglite://') ? url : url.replace(/\/\/[^@]*@/, '//***@')}`);

  switch (command) {
    case 'migrate':
      await runMigrations();
      console.log('Migrations applied.');
      break;
    case 'seed': {
      await runMigrations();
      const report = await seedCatalog(snapshotProducts, 'db:seed');
      console.log(report);
      break;
    }
    case 'inventory': {
      if (!argument) throw new Error('Usage: npm run db:inventory -- <path-to-csv>');
      const rows = parseCsv(await readFile(argument, 'utf8'));
      const header = rows[0]!.map((cell) => cell.trim().toLowerCase());
      const column = (...names: string[]) => header.findIndex((cell) => names.includes(cell));
      const idColumn = column('variant id', 'variant_id');
      const skuColumn = column('sku');
      const countColumn = column('on hand', 'on hand (new)', 'available', 'on_hand');
      if (countColumn < 0 || (idColumn < 0 && skuColumn < 0)) {
        throw new Error('The CSV needs a "Variant ID" or "SKU" column and an "On hand" (or "Available") column.');
      }
      const counts = rows.slice(1).map((row) => ({
        legacyVariantId: idColumn >= 0 ? row[idColumn]?.trim() || null : null,
        sku: skuColumn >= 0 ? row[skuColumn]?.trim() || null : null,
        onHand: Number(row[countColumn]),
      }));
      const report = await importInventoryCounts(counts, 'db:inventory');
      console.log(`Applied ${report.applied} counts. Unmatched: ${report.unmatched.length}`);
      if (report.unmatched.length) console.log(report.unmatched.join('\n'));
      break;
    }
    case 'customers':
    case 'orders': {
      if (!argument) throw new Error(`Usage: npm run migrate:${command} -- <path-to-csv> [--dry-run]`);
      const dryRun = process.argv.includes('--dry-run');
      const csv = await readFile(argument, 'utf8');
      const report = command === 'customers' ? await importCustomers(csv, { dryRun }) : await importOrders(csv, { dryRun });
      console.log(`${dryRun ? 'DRY RUN — nothing written. ' : ''}Rows read: ${report.rows}`);
      console.log(`  created            ${report.created}`);
      console.log(`  already present    ${report.skippedExisting}`);
      console.log(`  rejected           ${report.rejected.length}`);
      if (report.totalCents !== undefined) console.log(`  order total        ${(report.totalCents / 100).toFixed(2)}`);
      for (const entry of report.rejected) console.log(`  row ${entry.row}: ${entry.reason}`);
      break;
    }
    case 'reconcile': {
      const figures = await reconcile();
      for (const [key, value] of Object.entries(figures)) {
        console.log(`  ${key.padEnd(32)} ${key.endsWith('Cents') ? (value / 100).toFixed(2) : value}`);
      }
      break;
    }
    case 'status':
      await status();
      break;
    default:
      throw new Error('Usage: db.ts migrate | seed | status | inventory <csv> | customers <csv> | orders <csv> | reconcile');
  }
}

main()
  .catch((error) => {
    console.error(`db: ${(error as Error).message}`);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
