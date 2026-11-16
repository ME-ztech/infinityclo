/**
 * INFNITY brand-asset importer.
 *
 *   node scripts/import-brand-assets.mjs
 *
 * Companion to `import-infnity-catalog.ts`. Where that script reads the product
 * feed, this one reads the brand's own CMS pages on the legacy store
 * (`/pages.json`) and localises the assets the brand published there:
 *
 *   - the Styled By You / Troop community wall      -> public/community/
 *   - the size-chart graphics                       -> public/size-charts/
 *   - the "bundle of 2" offer artwork               -> public/brand/
 *   - the header logo and homepage artwork          -> public/brand/
 *
 * Only public pages are read. Nothing is generated, retouched or upscaled, and
 * every file is recorded in `src/data/catalog/brand-assets.json` with its source
 * URL so `docs/assets-and-rights.md` can account for it.
 */
import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const ORIGIN = process.env.LEGACY_ORIGIN ?? 'https://infinityclo.ca';
const ROOT = path.resolve(import.meta.dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const OUT = path.join(ROOT, 'src', 'data', 'catalog');
const MAX_WIDTH = 1600;

const exists = (file) =>
  access(file).then(
    () => true,
    () => false,
  );

async function fetchWithBackoff(url, init = {}) {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
    if (response.status !== 429 || attempt >= 5) return response;
    const retryAfter = Number(response.headers.get('retry-after'));
    const waitMs = retryAfter > 0 ? retryAfter * 1000 : 4000 * (attempt + 1);
    console.log(`  rate limited; waiting ${Math.round(waitMs / 1000)}s`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

/** Shopify CDN URLs accept a `width` parameter; strip any size suffix first. */
function cdnUrl(source) {
  const absolute = source.startsWith('//') ? `https:${source}` : source;
  const url = new URL(absolute);
  url.pathname = url.pathname.replace(/_(\d+x\d+|\d+x|x\d+)(\.[a-z]+)$/i, '$2');
  url.searchParams.set('width', String(MAX_WIDTH));
  return url.toString();
}

/** Reads width/height from PNG, JPEG and WebP headers without a dependency. */
function dimensions(buffer) {
  if (buffer.readUInt32BE(0) === 0x89504e47) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    const kind = buffer.toString('ascii', 12, 16);
    if (kind === 'VP8 ') {
      return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
    }
    if (kind === 'VP8L') {
      const bits = buffer.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (kind === 'VP8X') {
      return { width: buffer.readUIntLE(24, 3) + 1, height: buffer.readUIntLE(27, 3) + 1 };
    }
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset < buffer.length) {
      const marker = buffer[offset + 1];
      const size = buffer.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
      }
      offset += 2 + size;
    }
  }
  return { width: 0, height: 0 };
}

const EXTENSION = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

async function localise(source, directory, basename) {
  const hash = createHash('sha1').update(source).digest('hex').slice(0, 8);
  const response = await fetchWithBackoff(cdnUrl(source));
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${source}`);
  const type = (response.headers.get('content-type') ?? '').split(';')[0];
  const extension = EXTENSION[type] ?? 'jpg';
  const filename = `${basename}-${hash}.${extension}`;
  const destination = path.join(PUBLIC, directory, filename);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!(await exists(destination))) {
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, buffer);
  }
  return { url: `/${directory}/${filename}`, sourceUrl: source, bytes: buffer.length, ...dimensions(buffer) };
}

const imageSources = (html) =>
  [...new Set([...(html ?? '').matchAll(/src="([^"]+)"/g)].map((match) => match[1]))];

async function main() {
  console.log(`Importing brand assets from ${ORIGIN}`);
  const pagesResponse = await fetchWithBackoff(`${ORIGIN}/pages.json`);
  if (!pagesResponse.ok) throw new Error(`pages.json -> HTTP ${pagesResponse.status}`);
  const { pages } = await pagesResponse.json();
  const byHandle = new Map(pages.map((page) => [page.handle, page]));
  const records = [];
  const failures = [];

  const run = async (label, sources, directory, name, usage) => {
    const out = [];
    for (const [index, source] of sources.entries()) {
      try {
        const asset = await localise(source, directory, `${name}-${String(index + 1).padStart(2, '0')}`);
        out.push(asset);
        records.push({ ...asset, usage, sourcePage: label });
      } catch (error) {
        failures.push({ source, usage, error: error.message });
      }
    }
    console.log(`  ${label}: ${out.length}/${sources.length}`);
    return out;
  };

  // Community wall. The brand published these on its own "Troop" page under an
  // explicit "post and tag us to be here" invitation; handles were not published
  // alongside the photographs, so none are attributed here.
  const wall = await run(
    `${ORIGIN}/pages/customer-gallery`,
    imageSources(byHandle.get('customer-gallery')?.body_html),
    'community',
    'troop',
    'community',
  );
  const ugc = wall.map((asset, index) => ({
    id: `troop-${String(index + 1).padStart(2, '0')}`,
    media: {
      id: `troop-media-${String(index + 1).padStart(2, '0')}`,
      url: asset.url,
      alt: 'A member of the Troop styled in INFNITY',
      kind: 'ugc',
      width: asset.width,
      height: asset.height,
      position: index + 1,
      sourceUrl: asset.sourceUrl,
    },
    handle: null,
    caption: null,
    productSlugs: [],
    sourceUrl: `${ORIGIN}/pages/customer-gallery`,
  }));

  const charts = {};
  for (const [handle, key] of [
    ['tee-shirt-size-chart', 'tee'],
    ['pullover-hoodies', 'pullover-hoodie'],
    ['zip-up-hoodie-size-chart', 'zip-hoodie'],
    ['bottom-size-chart', 'bottoms'],
  ]) {
    const sources = imageSources(byHandle.get(handle)?.body_html);
    charts[key] = await run(`${ORIGIN}/pages/${handle}`, sources, 'size-charts', key, 'size-chart');
  }

  const bundle = await run(
    `${ORIGIN}/pages/bundle-of-2`,
    imageSources(byHandle.get('bundle-of-2')?.body_html),
    'brand',
    'bundle-of-2',
    'offer-artwork',
  );

  // Header logo and homepage artwork, read from the homepage markup.
  const home = await (await fetchWithBackoff(`${ORIGIN}/`)).text();
  const homeSources = [
    ...new Set(
      [...home.matchAll(/(?:https:)?\/\/[a-z0-9./_-]*cdn\/shop\/files\/[^"'\s?)&]+/gi)].map((match) =>
        match[0].startsWith('//') ? `https:${match[0]}` : match[0],
      ),
    ),
  ];
  const homeAssets = await run(`${ORIGIN}/`, homeSources, 'brand', 'home', 'brand-artwork');

  await writeFile(path.join(OUT, 'ugc.json'), `${JSON.stringify(ugc, null, 2)}\n`);
  await writeFile(
    path.join(OUT, 'brand-assets.json'),
    `${JSON.stringify(
      { importedAt: new Date().toISOString(), source: ORIGIN, sizeCharts: charts, bundle, home: homeAssets, assets: records, failures },
      null,
      2,
    )}\n`,
  );
  console.log(`Done. ${records.length} assets localised, ${failures.length} failed.`);
}

main().catch((error) => {
  console.error(`Brand asset import failed: ${error.message}`);
  process.exitCode = 1;
});
