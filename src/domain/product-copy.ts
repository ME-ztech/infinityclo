/**
 * Product copy parsing shared by the catalogue importer and the live Storefront
 * adapter, so a product reads the same whichever source served it.
 *
 * Every extractor quotes a fragment of the brand's own product copy. If the
 * sentence is not there, the field stays null. See the rules in
 * scripts/import-infnity-catalog.ts.
 */
import type { ProductSpecification } from './types';

/** Strips Shopify's body_html to plain paragraphs without inventing copy. */
export function htmlToText(html: string | null): string | null {
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
export function extractSpecification(description: string | null): {
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
    lines.find((line) => /\d{1,3}\s*%/.test(line) && FIBRES.test(line)) ??
    lines.find((line) => /\d{2,4}\s*gsm/i.test(line) && FIBRES.test(line)) ??
    find(/^materials?\s*[:—-]/i);

  // Every line that talks about fit, quoted and joined: "Baggy fitted tee ·
  // Size up for a baggier fit". A single line would drop half of the advice.
  const findAll = (test: RegExp): string | null => {
    const hits = lines.filter((line) => test.test(line));
    return hits.length ? hits.join(' · ') : null;
  };

  const fit =
    findAll(
      /\b(baggy|oversized?|relaxed|boxy|regular fit|slim|cropped|straight[- ]?leg(ged)?|true to size|size up|fitted)\b/i,
    ) ?? find(/^fit\s*[:—-]/i);

  const care = findAll(
    /\b(machine wash|hand wash|tumble dry|do not bleach|wash cold|dry clean|do not wash|hot water|cold water|line dry|iron)\b/i,
  );

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

