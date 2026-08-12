/**
 * Legacy catalog importer.
 *
 *   npm run import:legacy
 *
 * Reads the legacy INFNITY Shopify storefront **once**, normalises it into the
 * domain model, downloads the imagery into `public/assets`, and writes the JSON
 * snapshot that `src/data/adapters/local` serves. The storefront never contacts
 * the legacy site at runtime.
 *
 * Two rules govern this script:
 *
 * 1. It never invents a fact. Materials, fit, care, weight and measurements are
 *    written as `null` unless they can be read from the source. Everything left
 *    null is reported at the end and lands in docs/OPERATIONS_CONTENT_GAPS.md
 *    as a question for the brand, rather than being filled with a guess.
 * 2. It never silently drops an asset. Anything that fails to download is
 *    recorded in the provenance report so the gap is visible instead of being
 *    papered over with stock photography.
 *
 * Only public endpoints are read (`/products.json`, `/collections.json`). The
 * script performs no authentication and defeats no access control; if the host
 * is unreachable it reports that and exits without writing a partial snapshot.
 */
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  Collection,
  CurrencyCode,
  InventoryDisplayState,
  Product,
  ProductMedia,
  ProductOption,
  ProductVariant,
} from '../src/domain/types';

const LEGACY_ORIGIN = process.env.LEGACY_ORIGIN ?? 'https://infinityclo.ca';
const CURRENCY: CurrencyCode = 'CAD';
const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const ASSET_DIR = path.join(REPO_ROOT, 'public', 'assets', 'products');
const SNAPSHOT_DIR = path.join(REPO_ROOT, 'src', 'data', 'catalog');
const DOCS_DIR = path.join(REPO_ROOT, 'docs');

/* ------------------------------------------------------------------ *
 * Shopify's public JSON shapes (only the fields we consume)
 * ------------------------------------------------------------------ */

interface ShopifyImage {
  id: number;
  src: string;
  width: number;
  height: number;
  position: number;
  alt: string | null;
  variant_ids: number[];
}

interface ShopifyVariant {
  id: number;
  title: string;
  sku: string | null;
  price: string;
  compare_at_price: string | null;
  available: boolean;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  featured_image: { id: number } | null;
}

interface ShopifyOption {
  name: string;
  position: number;
  values: string[];
}

interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  body_html: string | null;
  product_type: string | null;
  tags: string[];
  published_at: string | null;
  variants: ShopifyVariant[];
  images: ShopifyImage[];
  options: ShopifyOption[];
}

interface ShopifyCollection {
  id: number;
  handle: string;
  title: string;
  body_html: string | null;
  published_at: string | null;
  image?: { src: string; width?: number; height?: number; alt?: string | null } | null;
}

/* ------------------------------------------------------------------ *
 * Reporting
 * ------------------------------------------------------------------ */

interface AssetRecord {
  localPath: string;
  sourceUrl: string;
  productSlug: string;
  alt: string;
  status: 'downloaded' | 'failed';
  note?: string;
}

const assetLog: AssetRecord[] = [];
const missingFacts: string[] = [];
const warnings: string[] = [];

/* ------------------------------------------------------------------ *
 * Fetch helpers
 * ------------------------------------------------------------------ */

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'INFNITY-catalog-import/1.0' },
  });
  if (!response.ok) {
    throw new Error(`GET ${url} -> HTTP ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

/** Walks Shopify's paginated products endpoint until it runs dry. */
async function fetchAllProducts(): Promise<ShopifyProduct[]> {
  const all: ShopifyProduct[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const url = `${LEGACY_ORIGIN}/products.json?limit=250&page=${page}`;
    const body = await fetchJson<{ products: ShopifyProduct[] }>(url);
    if (!body.products?.length) break;
    all.push(...body.products);
    process.stdout.write(`  page ${page}: ${body.products.length} products\n`);
    if (body.products.length < 250) break;
  }
  return all;
}

async function fetchCollections(): Promise<ShopifyCollection[]> {
  try {
    const body = await fetchJson<{ collections: ShopifyCollection[] }>(
      `${LEGACY_ORIGIN}/collections.json?limit=250`,
    );
    return body.collections ?? [];
  } catch (error) {
    warnings.push(`Could not read collections.json: ${(error as Error).message}`);
    return [];
  }
}

/** Which products belong to a collection, via the per-collection products feed. */
async function fetchCollectionProductHandles(handle: string): Promise<string[]> {
  try {
    const body = await fetchJson<{ products: ShopifyProduct[] }>(
      `${LEGACY_ORIGIN}/collections/${handle}/products.json?limit=250`,
    );
    return (body.products ?? []).map((product) => product.handle);
  } catch (error) {
    warnings.push(`Could not read products for collection "${handle}": ${(error as Error).message}`);
    return [];
  }
}

/* ------------------------------------------------------------------ *
 * Asset migration
 * ------------------------------------------------------------------ */

function assetFilename(productSlug: string, sourceUrl: string, position: number): string {
  const clean = sourceUrl.split('?')[0] ?? sourceUrl;
  const ext = path.extname(clean).toLowerCase() || '.jpg';
  // Hash keeps filenames unique when a product reuses a shot, while the slug
  // and position keep them human-readable in the repo.
  const hash = createHash('sha1').update(sourceUrl).digest('hex').slice(0, 8);
  return `${productSlug}-${String(position).padStart(2, '0')}-${hash}${ext}`;
}

async function downloadAsset(
  sourceUrl: string,
  productSlug: string,
  position: number,
  alt: string,
): Promise<string | null> {
  const filename = assetFilename(productSlug, sourceUrl, position);
  const destination = path.join(ASSET_DIR, filename);
  const publicPath = `/assets/products/${filename}`;

  try {
    const response = await fetch(sourceUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(destination, buffer);
    assetLog.push({ localPath: publicPath, sourceUrl, productSlug, alt, status: 'downloaded' });
    return publicPath;
  } catch (error) {
    // Recorded, not substituted. A missing shot is a documented gap.
    assetLog.push({
      localPath: publicPath,
      sourceUrl,
      productSlug,
      alt,
      status: 'failed',
      note: (error as Error).message,
    });
    warnings.push(`Asset download failed for ${productSlug}: ${sourceUrl}`);
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Normalisation
 * ------------------------------------------------------------------ */

/** Strips Shopify's body_html to plain paragraphs without inventing copy. */
function htmlToText(html: string | null): string | null {
  if (!html) return null;
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.length > 0 ? text : null;
}

function moneyFrom(value: string | null): { amount: number; currency: CurrencyCode } | null {
  if (value === null) return null;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return null;
  return { amount: Math.round(parsed * 100), currency: CURRENCY };
}

function availabilityOf(variant: ShopifyVariant): InventoryDisplayState {
  // Shopify's public feed exposes a boolean only. We never upgrade that to a
  // count or to "low stock" — inventing scarcity is out of bounds.
  return variant.available ? 'in_stock' : 'sold_out';
}

function buildAlt(product: ShopifyProduct, image: ShopifyImage, index: number): string {
  if (image.alt?.trim()) return image.alt.trim();
  // Generated alt describes the shot factually; it does not editorialise.
  return index === 0
    ? `${product.title} — INFNITY`
    : `${product.title} — INFNITY, view ${index + 1}`;
}

function mediaKindFor(index: number): ProductMedia['kind'] {
  // Position is the only signal the public feed gives. First shot is the
  // packshot; later shots are usually on-model. Anything finer would be a guess,
  // so the kinds stay coarse and are corrected by hand if needed.
  return index === 0 ? 'product' : 'model';
}

async function normaliseProduct(
  source: ShopifyProduct,
  collectionsByHandle: Map<string, string[]>,
): Promise<Product> {
  const slug = source.handle;

  const media: ProductMedia[] = [];
  const mediaIdByShopifyId = new Map<number, string>();

  for (const [index, image] of source.images.entries()) {
    const alt = buildAlt(source, image, index);
    const localPath = await downloadAsset(image.src, slug, image.position, alt);
    if (!localPath) continue;

    const id = `${slug}-media-${image.position}`;
    mediaIdByShopifyId.set(image.id, id);
    media.push({
      id,
      url: localPath,
      alt,
      kind: mediaKindFor(index),
      width: image.width,
      height: image.height,
      position: image.position,
      sourceUrl: image.src,
    });
  }

  if (media.length === 0) {
    warnings.push(`Product ${slug} has no usable imagery.`);
  }

  const options: ProductOption[] = source.options.map((option, index) => ({
    id: `${slug}-option-${index}`,
    name: option.name,
    position: option.position,
    values: option.values,
  }));

  const variants: ProductVariant[] = source.variants.map((variant) => {
    const selectedOptions: Record<string, string> = {};
    const values = [variant.option1, variant.option2, variant.option3];
    source.options.forEach((option, index) => {
      const value = values[index];
      if (value) selectedOptions[option.name] = value;
    });

    const price = moneyFrom(variant.price) ?? { amount: 0, currency: CURRENCY };
    if (!moneyFrom(variant.price)) {
      warnings.push(`Variant ${variant.id} on ${slug} had an unreadable price.`);
    }

    return {
      id: String(variant.id),
      sku: variant.sku?.trim() || null,
      title: variant.title,
      price,
      compareAtPrice: moneyFrom(variant.compare_at_price),
      availability: availabilityOf(variant),
      selectedOptions,
      mediaId: variant.featured_image
        ? (mediaIdByShopifyId.get(variant.featured_image.id) ?? null)
        : null,
    };
  });

  const collectionSlugs = [...collectionsByHandle.entries()]
    .filter(([, handles]) => handles.includes(slug))
    .map(([collectionSlug]) => collectionSlug);

  // Garment specifics are left null unless the brand supplies them. The legacy
  // body copy is prose, not structured spec data, and parsing "heavyweight" out
  // of marketing text would manufacture a claim.
  missingFacts.push(`${slug}: materials, fit, care, weight, country of origin`);

  return {
    id: String(source.id),
    slug,
    name: source.title,
    tagline: null,
    description: htmlToText(source.body_html),
    category: source.product_type?.trim() || null,
    collectionSlugs,
    options,
    variants,
    media,
    specification: {
      materials: null,
      fit: null,
      care: null,
      construction: null,
      weightGsm: null,
      countryOfOrigin: null,
    },
    sizeGuideId: null,
    publishedAt: source.published_at,
    legacyUrl: `${LEGACY_ORIGIN}/products/${slug}`,
    featuredRank: null,
  };
}

/* ------------------------------------------------------------------ *
 * Output
 * ------------------------------------------------------------------ */

async function writeSnapshot(name: string, data: unknown): Promise<void> {
  await writeFile(path.join(SNAPSHOT_DIR, `${name}.json`), `${JSON.stringify(data, null, 2)}\n`);
}

async function writeProvenance(products: readonly Product[]): Promise<void> {
  const downloaded = assetLog.filter((a) => a.status === 'downloaded');
  const failed = assetLog.filter((a) => a.status === 'failed');

  const lines = [
    '# Asset Provenance',
    '',
    '_Generated by `npm run import:legacy`. Do not edit by hand._',
    '',
    `Imported: ${new Date().toISOString()}`,
    `Source: ${LEGACY_ORIGIN}`,
    `Products: ${products.length}`,
    `Assets migrated: ${downloaded.length}`,
    `Assets failed: ${failed.length}`,
    '',
    'All imagery below originates from the brand\'s own storefront and is used',
    'with the project owner\'s authorisation. Files are stored in the repository',
    'rather than hotlinked, so the storefront has no runtime dependency on the',
    'legacy site. Images are resized and cropped for layout only; no edit alters',
    'how a garment or a person actually appears.',
    '',
    '## Migrated assets',
    '',
    '| Local path | Source URL | Product | Alt text |',
    '| --- | --- | --- | --- |',
    ...downloaded.map(
      (a) => `| \`${a.localPath}\` | ${a.sourceUrl} | ${a.productSlug} | ${a.alt} |`,
    ),
  ];

  if (failed.length > 0) {
    lines.push(
      '',
      '## Assets that could not be retrieved',
      '',
      'These are recorded rather than substituted. No stock photography has been',
      'used in their place; the affected surfaces render their empty state.',
      '',
      '| Source URL | Product | Reason |',
      '| --- | --- | --- |',
      ...failed.map((a) => `| ${a.sourceUrl} | ${a.productSlug} | ${a.note ?? 'unknown'} |`),
    );
  }

  await mkdir(DOCS_DIR, { recursive: true });
  await writeFile(path.join(DOCS_DIR, 'ASSET_PROVENANCE.md'), `${lines.join('\n')}\n`);
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

async function main(): Promise<void> {
  console.log(`Importing INFNITY catalog from ${LEGACY_ORIGIN}\n`);

  await mkdir(ASSET_DIR, { recursive: true });
  await mkdir(SNAPSHOT_DIR, { recursive: true });

  let sourceProducts: ShopifyProduct[];
  try {
    console.log('Fetching products...');
    sourceProducts = await fetchAllProducts();
  } catch (error) {
    // Fail loudly and leave the previous snapshot untouched. A half-written
    // catalog is worse than an obviously absent one.
    console.error(`\nFailed to reach the legacy store: ${(error as Error).message}`);
    console.error(
      '\nNo snapshot was written. If this is an egress/network policy denial,\n' +
        'allow the legacy host for this environment and re-run. Do not work around\n' +
        'the block, and do not hand-author product data to stand in for it.',
    );
    process.exitCode = 1;
    return;
  }

  if (sourceProducts.length === 0) {
    console.error('The store returned zero products. Refusing to overwrite the snapshot.');
    process.exitCode = 1;
    return;
  }

  console.log(`\nFetching collections...`);
  const sourceCollections = await fetchCollections();
  const collectionsByHandle = new Map<string, string[]>();
  for (const collection of sourceCollections) {
    const handles = await fetchCollectionProductHandles(collection.handle);
    collectionsByHandle.set(collection.handle, handles);
    console.log(`  ${collection.handle}: ${handles.length} products`);
  }

  console.log(`\nNormalising ${sourceProducts.length} products and migrating imagery...`);
  const products: Product[] = [];
  for (const source of sourceProducts) {
    products.push(await normaliseProduct(source, collectionsByHandle));
    process.stdout.write(`  ${source.handle}\n`);
  }

  const collections: Collection[] = sourceCollections.map((source) => ({
    slug: source.handle,
    name: source.title,
    description: htmlToText(source.body_html),
    heroMedia: null,
    // Drop labels and release dates are only ever set from verified source
    // data. Shopify's published_at is a publication timestamp, not a drop date,
    // so it is not promoted into `releasedAt`.
    dropLabel: null,
    releasedAt: null,
    isArchived: false,
    productSlugs: collectionsByHandle.get(source.handle) ?? [],
    legacyUrl: `${LEGACY_ORIGIN}/collections/${source.handle}`,
  }));

  await writeSnapshot('products', products);
  await writeSnapshot('collections', collections);
  await writeProvenance(products);

  console.log('\n--- Import summary ---');
  console.log(`Products:   ${products.length}`);
  console.log(`Collections:${collections.length}`);
  console.log(`Assets:     ${assetLog.filter((a) => a.status === 'downloaded').length} migrated`);
  console.log(`Failed:     ${assetLog.filter((a) => a.status === 'failed').length}`);
  console.log(`Warnings:   ${warnings.length}`);

  if (warnings.length > 0) {
    console.log('\nWarnings:');
    for (const warning of warnings.slice(0, 30)) console.log(`  - ${warning}`);
    if (warnings.length > 30) console.log(`  ...and ${warnings.length - 30} more`);
  }

  console.log(
    `\n${missingFacts.length} products need garment specifications confirmed by the brand.` +
      '\nThese are unset rather than guessed — see docs/OPERATIONS_CONTENT_GAPS.md.',
  );
}

void main();
