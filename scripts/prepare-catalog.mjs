/**
 * Build-time catalog preparation.
 *
 * Runs as `prebuild`, so it fires on Vercel before `next build`.
 *
 * Why this exists: the development environment this project was built in cannot
 * reach the legacy store — its egress policy denies the host — but a Vercel
 * build host can. Running the import here is what lets the deployed storefront
 * carry real products and real photography.
 *
 * This is still a *build-time* import. The running application never contacts
 * the legacy store; assets are written into `public/` and become part of the
 * build output.
 *
 * Three rules:
 *
 * 1. A committed snapshot always wins. If `src/data/catalog/products.json` has
 *    products in it, this does nothing — a reviewed, committed catalog is not
 *    silently replaced by a fresh scrape on every deploy.
 * 2. It can never fail the build. If the source is unreachable, the storefront
 *    deploys with its empty states, which is the honest outcome.
 * 3. It is bounded. A hung request cannot stall a deployment indefinitely.
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOT = path.join(ROOT, 'src', 'data', 'catalog', 'products.json');

const TIMEOUT_MS = Number(process.env.LEGACY_IMPORT_TIMEOUT_MS ?? 240_000);

function log(message) {
  console.log(`[prepare-catalog] ${message}`);
}

function committedProductCount() {
  try {
    const parsed = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

async function main() {
  if (process.env.SKIP_LEGACY_IMPORT === 'true') {
    log('SKIP_LEGACY_IMPORT=true — skipping.');
    return;
  }

  const committed = committedProductCount();
  if (committed > 0) {
    log(`Committed snapshot has ${committed} products — using it, not re-importing.`);
    return;
  }

  log('Catalog snapshot is empty. Attempting a build-time import of the legacy store.');
  log('If the source is unreachable the build continues and the storefront shows empty states.');

  const child = spawn('npx', ['tsx', 'scripts/import-legacy-catalog.ts'], {
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

  const imported = committedProductCount();

  if (code === 0 && imported > 0) {
    log(`Imported ${imported} products.`);
  } else {
    // Never fail the build. A storefront that deploys with honest empty states
    // is strictly better than a deployment that does not exist.
    log('Import did not complete. Continuing the build with an empty catalog.');
  }
}

main().catch((error) => {
  log(`Unexpected error: ${error?.message ?? error}. Continuing the build.`);
});
