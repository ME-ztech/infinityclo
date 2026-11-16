/**
 * Legacy content importer.
 *
 *   npm run import:content
 *
 * Reads the brand's *published* non-catalogue content from the live Shopify
 * store once and writes it into the repository:
 *
 *   - The five Shopify policies (refund, shipping, privacy, terms, contact),
 *     verbatim, into `src/data/catalog/policies.json`. These are the merchant's
 *     own current terms; the storefront shows them as-is and flags them for
 *     owner/legal review rather than paraphrasing or "improving" them.
 *   - The "THE TROOP IN INFNITY" community wall (`/pages/customer-gallery`) into
 *     `src/data/catalog/community-legacy.json`, so the moderated Styled By You
 *     gallery starts from exactly what the owner already publishes.
 *
 * Same rules as the catalogue importer: public endpoints only, CA market pinned,
 * nothing invented, nothing written if the source is unreachable.
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const ORIGIN = process.env.LEGACY_ORIGIN ?? 'https://infinityclo.ca';
const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(REPO_ROOT, 'src', 'data', 'catalog');
const TIMEOUT_MS = 25_000;

const POLICIES = [
  'refund-policy',
  'shipping-policy',
  'privacy-policy',
  'terms-of-service',
  'contact-information',
] as const;

export type PolicyBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] };

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { 'user-agent': 'INFNITY-content-import/1.0', cookie: 'localization=CA' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`GET ${url} -> HTTP ${response.status}`);
  return response.text();
}

function decode(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&#8217;/g, '’')
    .replace(/&lsquo;/g, '‘')
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripTags(html: string): string {
  return decode(html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Converts a policy body into typed blocks by *boundaries* rather than by
 * element, because Shopify policy HTML is inconsistent: Terms is one long
 * paragraph broken with `<br>`, Refund puts headings inline as `<strong>X</strong><br>`.
 * Heading elements and short bold lead-ins become headings, `<li>` runs become
 * lists, everything else is a paragraph. Wording is never altered.
 */
export function policyBlocks(bodyHtml: string): PolicyBlock[] {
  const H = '\u0001H\u0001';
  const L = '\u0001L\u0001';
  const marked = bodyHtml
    .replace(/<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, inner: string) => `\n${H}${inner}\n`)
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, inner: string) => `\n${L}${inner}\n`)
    .replace(
      /<(strong|b)>([^<]{1,80})<\/\1>\s*(?:<br\s*\/?>|<\/p>|<\/div>)/gi,
      (_, __, inner: string) => `\n${H}${inner}\n`,
    )
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|ul|ol|section|article)[^>]*>/gi, '\n');

  const blocks: PolicyBlock[] = [];
  for (const rawLine of marked.split('\n')) {
    const isHeading = rawLine.includes(H);
    const isItem = rawLine.includes(L);
    const text = stripTags(rawLine.replaceAll(H, '').replaceAll(L, ''));
    if (!text) continue;
    if (isItem) {
      const last = blocks.at(-1);
      if (last?.type === 'list') last.items.push(text);
      else blocks.push({ type: 'list', items: [text] });
    } else if (isHeading && text.length <= 80) {
      blocks.push({ type: 'heading', text });
    } else {
      blocks.push({ type: 'paragraph', text });
    }
  }
  return blocks;
}

async function importPolicies() {
  const policies = [];
  for (const handle of POLICIES) {
    const html = await fetchText(`${ORIGIN}/policies/${handle}`);
    const title = stripTags(html.match(/shopify-policy__title">\s*<h1>([\s\S]*?)<\/h1>/)?.[1] ?? handle);
    const body =
      html.match(/shopify-policy__body">\s*<div class="rte">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/)?.[1] ??
      '';
    const blocks = policyBlocks(body);
    if (blocks.length === 0) throw new Error(`Policy ${handle} parsed to nothing; refusing to write.`);
    policies.push({
      handle,
      title,
      blocks,
      sourceUrl: `${ORIGIN}/policies/${handle}`,
      fetchedAt: new Date().toISOString(),
    });
    console.log(`  ${handle}: ${blocks.length} blocks`);
  }
  return policies;
}

async function importCommunityWall() {
  const html = await fetchText(`${ORIGIN}/pages/customer-gallery`);
  const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
  const seen = new Set<string>();
  const entries = [];
  for (const match of main.matchAll(/<img[^>]*?(?:height="(\d+)")?[^>]*?(?:width="(\d+)")?[^>]*?src="([^"]+)"/gi)) {
    const raw = match[3] ?? '';
    if (!raw.includes('/files/')) continue;
    const base = raw.split('?')[0]!.replace(/^\/\//, 'https://');
    // `_2048x2048` is the largest rendition the page used; keep it as the source.
    if (seen.has(base)) continue;
    seen.add(base);
    const file = base.split('/').pop() ?? base;
    const id = file.replace(/_\d+x\d+/, '').replace(/\.[a-z]+$/i, '');
    const width = Number(match[2] ?? 0) || null;
    const height = Number(match[1] ?? 0) || null;
    entries.push({
      id: `legacy-${id.toLowerCase()}`,
      imageUrl: base,
      width,
      height,
      sourcePage: `${ORIGIN}/pages/customer-gallery`,
      position: entries.length,
    });
  }
  if (entries.length === 0) throw new Error('Community wall parsed to nothing; refusing to write.');
  console.log(`  customer-gallery: ${entries.length} images`);
  return entries;
}

async function main() {
  console.log(`Importing published content from ${ORIGIN}`);
  try {
    const policies = await importPolicies();
    const wall = await importCommunityWall();
    await writeFile(path.join(OUT_DIR, 'policies.json'), `${JSON.stringify(policies, null, 2)}\n`);
    await writeFile(path.join(OUT_DIR, 'community-legacy.json'), `${JSON.stringify(wall, null, 2)}\n`);
    console.log('Done.');
  } catch (error) {
    console.error(`Import failed, nothing written: ${(error as Error).message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  void main();
}
