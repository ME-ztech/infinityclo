import { ProductGrid } from '@/components/product/ProductGrid';
import { MediaFrame } from '@/components/ui/MediaFrame';
import { Reveal } from '@/components/ui/Reveal';
import { orderedMedia } from '@/domain/product';
import type { Product, ProductMedia } from '@/domain/types';

/**
 * The catalogue, with editorial interruptions.
 *
 * A mechanically uniform grid of forty cards is an inventory list. Breaking it
 * with a full-bleed campaign frame and a brand statement is what lets the shop
 * sell the world around INFNITY rather than a wall of SKUs — and it gives the
 * eye somewhere to rest, which is the difference between browsing a catalogue
 * and giving up on one.
 *
 * Three rules keep this from becoming decoration:
 *
 * 1. **Interruptions only appear when the catalogue is long enough to need
 *    them.** Under nine pieces the grid runs straight through; a "break" in a
 *    two-row grid breaks nothing.
 * 2. **The catalogue never ends on an interruption.** The last thing on the page
 *    is always product, because the last thing on the page should be something a
 *    customer can buy.
 * 3. **Every image is real INFNITY photography** pulled from the catalogue
 *    itself. When there is none, the image interruptions are simply not rendered
 *    — no stock photography, and no grey panel standing in for one.
 */
const CHUNK_SIZES = [6, 8, 10] as const;

/** The brand's own words. Nothing here is copy written for the storefront. */
const STATEMENTS = [
  { line: 'Don’t fold. Don’t follow.', accent: 'Never settle.' },
  { line: 'Raw identity,', accent: 'untouchable design.' },
] as const;

export function CatalogGrid({ products }: { products: readonly Product[] }) {
  const chunks = chunk(products);

  if (chunks.length <= 1) {
    return <ProductGrid products={products} density="showroom" priorityCount={4} />;
  }

  // Every per-chunk decision is resolved before rendering. Accumulating an
  // offset inside the map would be mutation during render, which is exactly the
  // pattern that breaks under concurrent rendering.
  const sections = planSections(chunks, collectCampaignShots(products));

  return (
    <div className="flex flex-col">
      {sections.map((section) => (
        <div key={section.startIndex}>
          <ProductGrid
            products={section.products}
            density="showroom"
            priorityCount={4}
            startIndex={section.startIndex}
          />

          {section.break?.kind === 'campaign' && <CampaignBreak media={section.break.media} />}
          {section.break?.kind === 'statement' && <StatementBreak {...section.break.statement} />}
        </div>
      ))}
    </div>
  );
}

type CatalogBreak =
  | { kind: 'campaign'; media: ProductMedia }
  | { kind: 'statement'; statement: (typeof STATEMENTS)[number] };

interface CatalogSection {
  startIndex: number;
  products: readonly Product[];
  /** Null on the last section — the page always ends on something buyable. */
  break: CatalogBreak | null;
}

function planSections(
  chunks: readonly (readonly Product[])[],
  shots: readonly ProductMedia[],
): CatalogSection[] {
  const sections: CatalogSection[] = [];
  let startIndex = 0;
  let shotCursor = 0;
  let statementCursor = 0;

  chunks.forEach((group, index) => {
    const isLast = index === chunks.length - 1;

    let nextBreak: CatalogBreak | null = null;
    if (!isLast) {
      // Alternate image and statement; fall back to a statement when the
      // catalogue has run out of photography to break with.
      const shot = index % 2 === 0 ? shots[shotCursor] : undefined;
      if (shot) {
        shotCursor += 1;
        nextBreak = { kind: 'campaign', media: shot };
      } else {
        nextBreak = {
          kind: 'statement',
          statement: STATEMENTS[statementCursor % STATEMENTS.length]!,
        };
        statementCursor += 1;
      }
    }

    sections.push({ startIndex, products: group, break: nextBreak });
    startIndex += group.length;
  });

  return sections;
}

/**
 * Full-bleed campaign frame. Cancels the page gutter so it touches the glass.
 *
 * The image is decorative here and carries an empty alt on purpose: the same
 * garment is already presented, named and priced in the grid immediately above,
 * so describing it again would make a screen reader repeat itself.
 */
function CampaignBreak({ media }: { media: ProductMedia }) {
  return (
    <figure data-surface="paper" className="bg-surface -mx-(--spacing-gutter) my-16 md:my-24">
      <Reveal>
        <MediaFrame
          src={media.url}
          alt=""
          sizes="100vw"
          ratioClassName="aspect-[4/5] sm:aspect-[16/9]"
          fallbackLabel="INFNITY"
        />
      </Reveal>
    </figure>
  );
}

function StatementBreak({ line, accent }: { line: string; accent: string }) {
  return (
    <aside
      data-surface="void"
      className="bg-surface text-fg -mx-(--spacing-gutter) my-16 px-(--spacing-gutter) py-20 md:my-24 md:py-28"
    >
      <Reveal>
        <div className="mb-6 flex items-center gap-4">
          <span aria-hidden className="bg-signal h-px w-10" />
          <p className="text-fg-faint text-[0.64rem] font-semibold tracking-[0.32em] uppercase">
            Infnity
          </p>
        </div>
        <p className="font-display oblique text-fg max-w-[16ch] text-[clamp(2rem,7vw,4.5rem)] leading-[0.95]">
          {line} <span className="text-signal">{accent}</span>
        </p>
      </Reveal>
    </aside>
  );
}

/**
 * Varies the run length so the page has a rhythm rather than a repeat. Any
 * trailing remainder is folded into the previous chunk instead of becoming a
 * lonely two-card row after a full-bleed image.
 */
function chunk(products: readonly Product[]): Product[][] {
  if (products.length <= 8) return [[...products]];

  const chunks: Product[][] = [];
  let index = 0;
  let size = 0;

  while (index < products.length) {
    const length = CHUNK_SIZES[size % CHUNK_SIZES.length]!;
    chunks.push([...products.slice(index, index + length)]);
    index += length;
    size += 1;
  }

  const last = chunks[chunks.length - 1];
  if (chunks.length > 1 && last && last.length <= 2) {
    chunks[chunks.length - 2]!.push(...last);
    chunks.pop();
  }

  return chunks;
}

/**
 * On-model shots make the best interruptions — a packshot blown up to full width
 * is just a large product photograph. Deduplicated by URL so the same frame
 * never appears twice on one page.
 */
function collectCampaignShots(products: readonly Product[]): ProductMedia[] {
  const seen = new Set<string>();
  const shots: ProductMedia[] = [];

  for (const product of products) {
    const media = orderedMedia(product);
    const candidate = media.find((item) => item.kind === 'model') ?? media[1];
    if (candidate && !seen.has(candidate.url)) {
      seen.add(candidate.url);
      shots.push(candidate);
    }
  }
  return shots;
}
