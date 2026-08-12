/**
 * INFNITY catalogue importer.
 *
 *   npm run import:catalog
 *
 * Reads the live INFNITY storefront **once**, normalises it into the domain
 * model, downloads every product photograph into `public/products/<slug>/`, and
 * writes the JSON snapshot that `src/data/adapters/local` serves. The deployed
 * storefront never contacts infinityclo.ca at runtime: import once, normalise,
 * store locally, render reliably.
 *
 * Rules this script does not break:
 *
 * 1. **It never invents a fact.** Materials, fit and weight are only ever
 *    written when they can be *read out of the brand's own product copy* — the
 *    extractors below quote the source, they do not summarise it. Everything
 *    else stays null and is reported as a gap.
 * 2. **It never silently drops an asset.** Anything that fails to download is
 *    recorded in the provenance report. Where a download fails but the source
 *    URL is valid, the product keeps the remote URL so the customer still sees
 *    the garment — recorded as `remote-fallback`, never as a success.
 * 3. **It never half-writes a catalogue.** If the store is unreachable it exits
 *    without touching the snapshot, because a partial catalogue is worse than an
 *    obviously absent one.
 *
 * Only public endpoints are read (`/products.json`, `/collections.json`). No
 * authentication is performed and no access control is defeated.
 */
import { createHash } from 'node:crypto';
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  Collection,
  CurrencyCode,
  InventoryDisplayState,
  Product,
  ProductMedia,
  ProductOption,
  ProductSpecification,
  ProductVariant,
} from '../src/domain/types';

const ORIGIN = process.env.LEGACY_ORIGIN ?? 'https://infinityclo.ca';
const CURRENCY: CurrencyCode = 'CAD';
const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const PRODUCT_ASSET_ROOT = path.join(REPO_ROOT, 'public', 'products');
const SNAPSHOT_DIR = path.join(REPO_ROOT, 'src', 'data', 'catalog');
const DOCS_DIR = path.join(REPO_ROOT, 'docs');

/** Per-request ceiling, so a hung connection cannot stall a deployment. */
const REQUEST_TIMEOUT_MS = Number(process.env.IMPORT_REQUEST_TIMEOUT_MS ?? 25_000);

/**
 * Largest edge we store. Fashion photography has to stay sharp, so this is
 * generous — but a 4000px original is bytes nobody will ever see, and Shopify's
 * CDN will resize server-side if we ask, which keeps the repository sane and the
 * build fast without touching image quality at display sizes.
 */
const MAX_IMAGE_WIDTH = 1600;

/** Concurrent image downloads. Enough to be quick, few enough to stay polite. */
const DOWNLOAD_CONCURRENCY = 6;

/** Collection handles that mean "not current inventory". */
const ARCHIVE_HANDLE = /\b(vault|archive|archived|past|sold-?out)\b/i;

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
  tags: string[] | string;
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

type AssetStatus = 'downloaded' | 'cached' | 'remote-fallback' | 'failed';

interface AssetRecord {
  localPath: string;
  sourceUrl: string;
  productSlug: string;
  alt: string;
  status: AssetStatus;
  note?: string;
}

const assetLog: AssetRecord[] = [];
const warnings: string[] = [];
const factGaps: Array<{ slug: string; missing: string[] }> = [];

/* ------------------------------------------------------------------ *
 * Fetch helpers
 * ------------------------------------------------------------------ */

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'INFNITY-catalog-import/1.1' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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
    const body = await fetchJson<{ products: ShopifyProduct[] }>(
      `${ORIGIN}/products.json?limit=250&page=${page}`,
    );
    if (!body.products?.length) break;
    all.push(...body.products);
    console.log(`  page ${page}: ${body.products.length} products`);
    if (body.products.length < 250) break;
  }
  return all;
}

async function fetchCollections(): Promise<ShopifyCollection[]> {
  try {
    const body = await fetchJson<{ collections: ShopifyCollection[] }>(
      `${ORIGIN}/collections.json?limit=250`,
    );
    return body.collections ?? [];
  } catch (error) {
    warnings.push(`Could not read collections.json: ${(error as Error).message}`);
    return [];
  }
}

/**
 * Which products belong to a collection, **in the order the brand merchandised
 * them**. That order is the only real "featured" signal the public feed exposes,
 * and it is what drives `featuredRank` below — as opposed to inventing a
 * curation the brand never expressed.
 */
async function fetchCollectionProductHandles(handle: string): Promise<string[]> {
  try {
    const body = await fetchJson<{ products: ShopifyProduct[] }>(
      `${ORIGIN}/collections/${handle}/products.json?limit=250`,
    );
    return (body.products ?? []).map((product) => product.handle);
  } catch (error) {
    warnings.push(
      `Could not read products for collection "${handle}": ${(error as Error).message}`,
    );
    return [];
  }
}

/* ------------------------------------------------------------------ *
 * Asset migration
 * ------------------------------------------------------------------ */

/**
 * Asks the CDN for a sensible delivery width instead of the master file.
 * Shopify honours `width` on its image URLs; anything else is passed through
 * untouched so a non-Shopify asset still downloads.
 */
function cdnUrlAtWidth(sourceUrl: string, width: number): string {
  try {
    const url = new URL(sourceUrl);
    if (!/(^|\.)shopify\.com$/.test(url.hostname) && !url.hostname.includes('shopify')) {
      return sourceUrl;
    }
    url.searchParams.set('width', String(width));
    return url.toString();
  } catch {
    return sourceUrl;
  }
}

function assetFilename(sourceUrl: string, position: number): string {
  const clean = sourceUrl.split('?')[0] ?? sourceUrl;
  const ext = path.extname(clean).toLowerCase() || '.jpg';
  // The hash keeps filenames unique when a product reuses a shot; the position
  // keeps the directory listing in gallery order.
  const hash = createHash('sha1').update(sourceUrl).digest('hex').slice(0, 8);
  return `${String(position).padStart(2, '0')}-${hash}${ext}`;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

interface DownloadResult {
  /** What the storefront should render: a local path, or the remote fallback. */
  url: string;
  status: AssetStatus;
}

async function downloadAsset(
  sourceUrl: string,
  productSlug: string,
  position: number,
  alt: string,
): Promise<DownloadResult> {
  const filename = assetFilename(sourceUrl, position);
  const directory = path.join(PRODUCT_ASSET_ROOT, productSlug);
  const destination = path.join(directory, filename);
  const publicPath = `/products/${productSlug}/${filename}`;

  // Re-running the importer must not re-download the whole catalogue.
  if (await exists(destination)) {
    assetLog.push({ localPath: publicPath, sourceUrl, productSlug, alt, status: 'cached' });
    return { url: publicPath, status: 'cached' };
  }

  try {
    await mkdir(directory, { recursive: true });
    const response = await fetch(cdnUrlAtWidth(sourceUrl, MAX_IMAGE_WIDTH), {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength === 0) throw new Error('empty response body');

    await writeFile(destination, buffer);
    assetLog.push({ localPath: publicPath, sourceUrl, productSlug, alt, status: 'downloaded' });
    return { url: publicPath, status: 'downloaded' };
  } catch (error) {
    // The garment still gets shown. Hotlinking the CDN is explicitly not the
    // goal, so this is recorded as a *failure to localise* rather than as a
    // success, and it appears in the provenance report as work still to do.
    assetLog.push({
      localPath: publicPath,
      sourceUrl,
      productSlug,
      alt,
      status: 'remote-fallback',
      note: (error as Error).message,
    });
    warnings.push(
      `Could not localise ${productSlug} image ${position}: ${(error as Error).message}`,
    );
    return { url: sourceUrl, status: 'remote-fallback' };
  }
}

/** Bounded parallelism. Keeps a 40-product catalogue from opening 200 sockets. */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function run(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]!, index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

/* ------------------------------------------------------------------ *
 * Normalisation
 * ------------------------------------------------------------------ */

/** Strips Shopify's body_html to plain paragraphs without inventing copy. */
function htmlToText(html: string | null): string | null {
  if (!html) return null;
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, '’')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.length > 0 ? text : null;
}

const FIBRES =
  /(cotton|polyester|nylon|acrylic|wool|elastane|spandex|rayon|viscose|linen|fleece|modal|cashmere)/i;

/**
 * Garment specification extraction.
 *
 * Every extractor below quotes a fragment of the brand's own product copy. If
 * the sentence is not there, the field stays null and is reported as a gap. That
 * is the whole contract: a customer ordering a garment is entitled to know that
 * "heavyweight 400gsm French terry" came from the brand and not from a build
 * script's idea of what a hoodie usually is.
 */
function extractSpecification(description: string | null): {
  spec: ProductSpecification;
  missing: string[];
} {
  const empty: ProductSpecification = {
    materials: null,
    fit: null,
    care: null,
    construction: null,
    weightGsm: null,
    countryOfOrigin: null,
    modelInfo: null,
  };

  if (!description) {
    return {
      spec: empty,
      missing: ['materials', 'fit', 'care', 'weight', 'origin', 'model sizing'],
    };
  }

  const lines = description
    .split(/\n+/)
    .map((line) => line.replace(/^[•\-*\s]+/, '').trim())
    .filter(Boolean);

  const find = (test: RegExp): string | null => lines.find((line) => test.test(line)) ?? null;

  // "100% cotton", "80% cotton / 20% polyester", or a labelled Material: line.
  const materials =
    find(/\d{1,3}\s*%/) && FIBRES.test(description)
      ? find(/\d{1,3}\s*%/)
      : find(/^materials?\s*[:—-]/i);

  const fit =
    find(/\b(oversized|relaxed|boxy|regular|slim|cropped|true to size)\b.*\bfit\b/i) ??
    find(/^fit\s*[:—-]/i);

  const care = find(/\b(machine wash|hand wash|tumble dry|do not bleach|wash cold|dry clean)\b/i);

  const gsmMatch = description.match(/(\d{2,4})\s*(?:gsm|g\/m²|g\/m2|gram)/i);
  const weightGsm = gsmMatch ? Number.parseInt(gsmMatch[1]!, 10) : null;

  const originMatch = description.match(/\bmade in ([A-Z][A-Za-z ]{2,24})/);
  const countryOfOrigin = originMatch ? originMatch[1]!.trim() : null;

  const construction = find(
    /\b(french terry|heavyweight|double[- ]stitch|embroider|screen[- ]print|puff print|garment[- ]dye)\b/i,
  );

  const spec: ProductSpecification = {
    materials: materials?.trim() ?? null,
    fit: fit?.trim() ?? null,
    care: care?.trim() ?? null,
    construction: construction?.trim() ?? null,
    weightGsm: weightGsm && weightGsm >= 80 && weightGsm <= 900 ? weightGsm : null,
    countryOfOrigin,
    // "Model is 6'1 and wears a size L" — quoted from the brand's copy, never
    // synthesised from the size run.
    modelInfo: find(/\bmodel\b.*\b(wear|wears|wearing|is)\b/i)?.trim() ?? null,
  };

  const missing = (
    [
      ['materials', spec.materials],
      ['fit', spec.fit],
      ['care', spec.care],
      ['weight', spec.weightGsm],
      ['origin', spec.countryOfOrigin],
      ['model sizing', spec.modelInfo],
    ] as const
  )
    .filter(([, value]) => value === null)
    .map(([label]) => label);

  return { spec, missing };
}

function moneyFrom(value: string | null): { amount: number; currency: CurrencyCode } | null {
  if (value === null) return null;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return null;
  return { amount: Math.round(parsed * 100), currency: CURRENCY };
}

function availabilityOf(variant: ShopifyVariant, isArchived: boolean): InventoryDisplayState {
  // The public feed exposes a boolean only. We never upgrade that to a count or
  // to "low stock" — inventing scarcity is out of bounds.
  if (variant.available) return 'in_stock';
  return isArchived ? 'archived' : 'sold_out';
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
  // packshot; later shots are usually on-model. Anything finer would be a guess.
  return index === 0 ? 'product' : 'model';
}

/** Scales the recorded dimensions to match the width we actually stored. */
function scaledDimensions(image: ShopifyImage): { width: number; height: number } {
  const width = image.width || MAX_IMAGE_WIDTH;
  const height = image.height || Math.round(width * (4 / 3));
  if (width <= MAX_IMAGE_WIDTH) return { width, height };
  return { width: MAX_IMAGE_WIDTH, height: Math.round(height * (MAX_IMAGE_WIDTH / width)) };
}

function tagsOf(source: ShopifyProduct): string[] {
  if (Array.isArray(source.tags)) return source.tags.map((tag) => tag.trim()).filter(Boolean);
  if (typeof source.tags === 'string') {
    return source.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
  return [];
}

interface NormaliseContext {
  /** Collection handle -> product handles, in merchandised order. */
  readonly membership: ReadonlyMap<string, readonly string[]>;
  /** Product handle -> rank in the primary collection, if it appears in one. */
  readonly featuredRanks: ReadonlyMap<string, number>;
  readonly archivedHandles: ReadonlySet<string>;
}

async function normaliseProduct(
  source: ShopifyProduct,
  context: NormaliseContext,
): Promise<Product> {
  const slug = source.handle;

  const collectionSlugs = [...context.membership.entries()]
    .filter(([, handles]) => handles.includes(slug))
    .map(([collectionSlug]) => collectionSlug);

  const isArchived = collectionSlugs.some((handle) => context.archivedHandles.has(handle));

  const downloads = await mapWithConcurrency(
    source.images,
    DOWNLOAD_CONCURRENCY,
    async (image, index) =>
      downloadAsset(image.src, slug, image.position || index + 1, buildAlt(source, image, index)),
  );

  const media: ProductMedia[] = [];
  const mediaIdByShopifyId = new Map<number, string>();

  source.images.forEach((image, index) => {
    const download = downloads[index];
    if (!download || download.status === 'failed') return;

    const id = `${slug}-media-${image.position || index + 1}`;
    const { width, height } = scaledDimensions(image);
    mediaIdByShopifyId.set(image.id, id);

    media.push({
      id,
      url: download.url,
      alt: buildAlt(source, image, index),
      kind: mediaKindFor(index),
      width,
      height,
      position: image.position || index + 1,
      sourceUrl: image.src,
    });
  });

  if (media.length === 0) warnings.push(`Product ${slug} has no usable imagery.`);

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

    const price = moneyFrom(variant.price);
    if (!price) warnings.push(`Variant ${variant.id} on ${slug} had an unreadable price.`);

    return {
      id: String(variant.id),
      sku: variant.sku?.trim() || null,
      title: variant.title,
      price: price ?? { amount: 0, currency: CURRENCY },
      compareAtPrice: moneyFrom(variant.compare_at_price),
      availability: availabilityOf(variant, isArchived),
      selectedOptions,
      mediaId: variant.featured_image
        ? (mediaIdByShopifyId.get(variant.featured_image.id) ?? null)
        : null,
    };
  });

  const description = htmlToText(source.body_html);
  const { spec, missing } = extractSpecification(description);
  if (missing.length > 0) factGaps.push({ slug, missing });

  return {
    id: String(source.id),
    slug,
    name: source.title,
    // A tagline is editorial copy the brand has not written. Left null so the
    // UI omits the line rather than printing a sentence we made up.
    tagline: null,
    description,
    category: source.product_type?.trim() || null,
    collectionSlugs,
    options,
    variants,
    media,
    specification: spec,
    tags: tagsOf(source),
    sizeGuideId: null,
    publishedAt: source.published_at,
    legacyUrl: `${ORIGIN}/products/${slug}`,
    featuredRank: context.featuredRanks.get(slug) ?? null,
  };
}

/* ------------------------------------------------------------------ *
 * Output
 * ------------------------------------------------------------------ */

async function writeSnapshot(name: string, data: unknown): Promise<void> {
  await writeFile(path.join(SNAPSHOT_DIR, `${name}.json`), `${JSON.stringify(data, null, 2)}\n`);
}

async function writeProvenance(products: readonly Product[]): Promise<void> {
  const byStatus = (status: AssetStatus) => assetLog.filter((asset) => asset.status === status);
  const localised = [...byStatus('downloaded'), ...byStatus('cached')];
  const remote = byStatus('remote-fallback');

  const lines = [
    '# Asset Provenance',
    '',
    '_Generated by `npm run import:catalog`. Do not edit by hand._',
    '',
    `Imported: ${new Date().toISOString()}`,
    `Source: ${ORIGIN}`,
    `Products: ${products.length}`,
    `Photographs localised: ${localised.length}`,
    `Still hotlinked (localisation failed): ${remote.length}`,
    '',
    "All imagery below originates from the brand's own storefront and is used with",
    "the project owner's authorisation. Files are stored in the repository rather",
    'than hotlinked, so the storefront has no runtime dependency on the source',
    'site. Images are resized for delivery and cropped for layout only; no edit',
    'alters how a garment or a person actually appears.',
    '',
    '## Localised photography',
    '',
    '| Local path | Source URL | Product | Alt text |',
    '| --- | --- | --- | --- |',
    ...localised.map(
      (a) => `| \`${a.localPath}\` | ${a.sourceUrl} | ${a.productSlug} | ${a.alt} |`,
    ),
  ];

  if (remote.length > 0) {
    lines.push(
      '',
      '## Photographs that could not be localised',
      '',
      'These render from the source CDN so the customer still sees the garment,',
      'but they remain a runtime dependency on an external host and should be',
      're-imported. No stock photography has been substituted.',
      '',
      '| Source URL | Product | Reason |',
      '| --- | --- | --- |',
      ...remote.map((a) => `| ${a.sourceUrl} | ${a.productSlug} | ${a.note ?? 'unknown'} |`),
    );
  }

  await mkdir(DOCS_DIR, { recursive: true });
  await writeFile(path.join(DOCS_DIR, 'ASSET_PROVENANCE.md'), `${lines.join('\n')}\n`);
}

/**
 * The manifest is the reproducibility record: what ran, against what, and what
 * came back. It is what makes "import once, render locally" auditable instead of
 * something you have to take on trust.
 */
async function writeManifest(
  products: readonly Product[],
  collections: readonly Collection[],
): Promise<void> {
  const byStatus = (status: AssetStatus) => assetLog.filter((a) => a.status === status).length;

  await writeSnapshot('manifest', {
    importedAt: new Date().toISOString(),
    source: ORIGIN,
    productCount: products.length,
    collectionCount: collections.length,
    mediaCount: products.reduce((total, product) => total + product.media.length, 0),
    assets: {
      downloaded: byStatus('downloaded'),
      cached: byStatus('cached'),
      remoteFallback: byStatus('remote-fallback'),
      failed: byStatus('failed'),
    },
    productsWithoutMedia: products.filter((p) => p.media.length === 0).map((p) => p.slug),
    productsWithSingleImage: products.filter((p) => p.media.length === 1).map((p) => p.slug),
    factGaps,
    warnings,
  });
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

async function main(): Promise<void> {
  console.log(`Importing the INFNITY catalogue from ${ORIGIN}\n`);

  await mkdir(PRODUCT_ASSET_ROOT, { recursive: true });
  await mkdir(SNAPSHOT_DIR, { recursive: true });

  let sourceProducts: ShopifyProduct[];
  try {
    console.log('Fetching products...');
    sourceProducts = await fetchAllProducts();
  } catch (error) {
    console.error(`\nCould not reach the storefront: ${(error as Error).message}`);
    console.error(
      '\nNo snapshot was written. If this is an egress/network policy denial,\n' +
        'allow infinityclo.ca for this environment and re-run. Do not work around\n' +
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

  console.log('\nFetching collections...');
  const sourceCollections = await fetchCollections();

  const membership = new Map<string, readonly string[]>();
  for (const collection of sourceCollections) {
    const handles = await fetchCollectionProductHandles(collection.handle);
    membership.set(collection.handle, handles);
    console.log(`  ${collection.handle}: ${handles.length} products`);
  }

  const archivedHandles = new Set(
    sourceCollections
      .filter(
        (collection) =>
          ARCHIVE_HANDLE.test(collection.handle) || ARCHIVE_HANDLE.test(collection.title),
      )
      .map((collection) => collection.handle),
  );

  /**
   * Featured order comes from the brand's own merchandising: the position of a
   * product inside the storefront's primary collection. `frontpage` is Shopify's
   * home-page collection and is the strongest signal; `all` is the fallback.
   * Products in neither keep a null rank and sort after the ranked ones.
   */
  const primaryCollection =
    ['frontpage', 'all', 'featured'].find((handle) => (membership.get(handle)?.length ?? 0) > 0) ??
    null;

  const featuredRanks = new Map<string, number>();
  if (primaryCollection) {
    membership.get(primaryCollection)?.forEach((handle, index) => featuredRanks.set(handle, index));
    console.log(`\nFeatured order taken from the "${primaryCollection}" collection.`);
  } else {
    warnings.push('No primary collection found; featured order falls back to alphabetical.');
  }

  console.log(`\nNormalising ${sourceProducts.length} products and migrating photography...`);
  const products: Product[] = [];
  for (const source of sourceProducts) {
    const product = await normaliseProduct(source, { membership, featuredRanks, archivedHandles });
    products.push(product);
    console.log(
      `  ${product.slug} — ${product.media.length} images, ${product.variants.length} variants`,
    );
  }

  const collections: Collection[] = await Promise.all(
    sourceCollections.map(async (source): Promise<Collection> => {
      const heroSource = source.image?.src ?? null;
      let heroMedia: Collection['heroMedia'] = null;

      if (heroSource) {
        const download = await downloadAsset(
          heroSource,
          `collection-${source.handle}`,
          1,
          source.image?.alt?.trim() || `${source.title} — INFNITY`,
        );
        heroMedia = {
          id: `collection-${source.handle}-hero`,
          url: download.url,
          alt: source.image?.alt?.trim() || `${source.title} — INFNITY`,
          kind: 'campaign',
          width: Math.min(source.image?.width ?? MAX_IMAGE_WIDTH, MAX_IMAGE_WIDTH),
          height: source.image?.height ?? Math.round(MAX_IMAGE_WIDTH * 0.5625),
          position: 1,
          sourceUrl: heroSource,
        };
      }

      return {
        slug: source.handle,
        name: source.title,
        description: htmlToText(source.body_html),
        heroMedia,
        // Drop labels and release dates are only ever set from verified source
        // data. Shopify's published_at is a publication timestamp, not a drop
        // date, so it is not promoted into `releasedAt`.
        dropLabel: null,
        releasedAt: null,
        isArchived: archivedHandles.has(source.handle),
        productSlugs: membership.get(source.handle) ?? [],
        legacyUrl: `${ORIGIN}/collections/${source.handle}`,
      };
    }),
  );

  await writeSnapshot('products', products);
  await writeSnapshot('collections', collections);
  await writeManifest(products, collections);
  await writeProvenance(products);

  const localised = assetLog.filter((a) => a.status === 'downloaded' || a.status === 'cached');
  const remote = assetLog.filter((a) => a.status === 'remote-fallback');

  console.log('\n--- Import summary ---');
  console.log(`Products:     ${products.length}`);
  console.log(`Collections:  ${collections.length}`);
  console.log(`Photographs:  ${localised.length} localised, ${remote.length} still remote`);
  console.log(`Galleries:    ${products.filter((p) => p.media.length > 1).length} with 2+ images`);
  console.log(`Warnings:     ${warnings.length}`);

  if (warnings.length > 0) {
    console.log('\nWarnings:');
    for (const warning of warnings.slice(0, 30)) console.log(`  - ${warning}`);
    if (warnings.length > 30) console.log(`  ...and ${warnings.length - 30} more`);
  }

  console.log(
    `\n${factGaps.length} products still need garment specifications confirmed by the brand.` +
      '\nThose fields are unset rather than guessed — see src/data/catalog/manifest.json.',
  );
}

void main();
