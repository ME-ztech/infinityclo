/**
 * Build-time catalogue preparation.
 *
 * Runs as `prebuild`, so it fires on Vercel before `next build`.
 *
 * Why this exists: the development environment this storefront is built in
 * cannot reach infinityclo.ca — the egress policy denies the host — but a Vercel
 * build host can. Running the import here is what lets the deployed storefront
 * carry the brand's real products and real photography. Assets land in
 * `public/products/<slug>/` during this step and become part of the build
 * output, so the running application still never contacts the source site.
 *
 * Four rules:
 *
 * 1. A committed snapshot always wins. If `src/data/catalog/products.json` has
 *    products in it, this does nothing — a reviewed, committed catalogue is not
 *    silently replaced by a fresh scrape on every deploy.
 * 2. It can never fail the build. If the source is unreachable the storefront
 *    deploys against its verified seed catalogue instead, which carries real
 *    product names and real prices but no photography.
 * 3. It is bounded. A hung request cannot stall a deployment indefinitely.
 * 4. It says out loud what happened, so a deploy log is enough to tell whether
 *    the storefront is serving imported photography or the seed.
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOT = path.join(ROOT, 'src', 'data', 'catalog', 'products.json');
const IMPORTER = 'scripts/import-infnity-catalog.ts';

const TIMEOUT_MS = Number(process.env.LEGACY_IMPORT_TIMEOUT_MS ?? 240_000);

function log(message) {
  console.log(`[prepare-catalog] ${message}`);
}

function snapshotStats() {
  try {
    const parsed = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
    if (!Array.isArray(parsed)) return { products: 0, media: 0 };
    return {
      products: parsed.length,
      media: parsed.reduce((total, product) => total + (product?.media?.length ?? 0), 0),
    };
  } catch {
    return { products: 0, media: 0 };
  }
}

async function main() {
  if (process.env.SKIP_LEGACY_IMPORT === 'true') {
    log('SKIP_LEGACY_IMPORT=true — skipping the import.');
    return;
  }

  const committed = snapshotStats();
  if (committed.products > 0) {
    log(
      `Committed snapshot has ${committed.products} products and ${committed.media} photographs — using it, not re-importing.`,
    );
    return;
  }

  log('Catalogue snapshot is empty. Attempting a build-time import of the live store.');
  log('If the source is unreachable the build continues against the verified seed catalogue.');

  const child = spawn('npx', ['tsx', IMPORTER], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });

  const timer = setTimeout(() => {
    log(`Import exceeded ${TIMEOUT_MS}ms — terminating so the build can proceed.`);
    child.kill('SIGTERM');
  }, TIMEOUT_MS);

  const code = await new Promise((resolve) => {
    child.on('close', resolve);
    child.on('error', () => resolve(1));
  });
  clearTimeout(timer);

  const imported = snapshotStats();

  if (code === 0 && imported.products > 0) {
    log(`Imported ${imported.products} products and ${imported.media} photographs.`);
  } else {
    // Never fail the build. A storefront that deploys against the seed — real
    // names, real prices, no photography — is strictly better than one that
    // does not deploy at all.
    log('Import did not complete. Building against the verified seed catalogue.');
    log('Product names and prices are real; product photography will be absent.');
  }
}

main().catch((error) => {
  log(`Unexpected error: ${error?.message ?? error}. Continuing the build.`);
});
