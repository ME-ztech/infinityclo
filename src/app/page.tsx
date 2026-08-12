import { Hero } from '@/components/home/Hero';
import { Section, SectionHeader } from '@/components/layout/Section';
import { ProductGrid } from '@/components/product/ProductGrid';
import { ProductRack } from '@/components/product/ProductRack';
import { TroopGallery } from '@/components/troop/TroopGallery';
import { ButtonLink, TextLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { MediaFrame } from '@/components/ui/MediaFrame';
import { Reveal } from '@/components/ui/Reveal';
import { catalogRepository, contentRepository } from '@/data';
import { orderedMedia, primaryMedia } from '@/domain/product';
import type { Product, ProductMedia } from '@/domain/types';

export const revalidate = 3600;

/**
 * Homepage.
 *
 * Composed as a sequence of *rooms*. Scrolling it should feel like moving
 * through a store rather than down a page, and that only works if the rooms are
 * made of different materials:
 *
 *   BONE      hero — type-led, the front window
 *   PAPER     the drop — a white showroom, garments on white
 *   VOID      manifesto — the lights go out, the brand speaks
 *   BONE      editorial — campaign photography at scale
 *   INK       the Vault — the archive room
 *   CONCRETE  essentials — the core rail
 *   PAPER     the Troop — customer fits
 *   VOID      newsletter and footer (in `Footer`)
 *
 * Black is now a *punctuation mark* in that sequence rather than the background
 * it was in 1.0. Two dark rooms across a long scroll land hard; eight of them
 * land as nothing at all.
 *
 * Sections that depend on photography are rendered only when the photography
 * exists. That is what keeps this composition honest whether the catalogue
 * import has run or not: it degrades to a shorter, tighter page rather than to a
 * page of empty grey rectangles apologising for themselves.
 */
export default async function HomePage() {
  const [{ products: featured }, { products: newest }, collections, ugc, campaigns] =
    await Promise.all([
      catalogRepository.listProducts({ sort: 'featured', limit: 8 }),
      catalogRepository.listProducts({ sort: 'newest', limit: 8 }),
      catalogRepository.listCollections(),
      contentRepository.listUGC(8),
      contentRepository.listCampaigns(),
    ]);

  const { products: essentials } = await catalogRepository.listProducts({
    sort: 'featured',
    limit: 3,
    offset: 8,
  });

  /**
   * "New Arrivals" is only an honest heading when publish dates exist to sort
   * by. Without them the newest sort degrades to alphabetical, so the section
   * keeps the same design and takes the brand's own merchandised order under a
   * heading that claims nothing about dates.
   */
  const hasPublishDates = newest.some((product) => product.publishedAt !== null);
  const dropProducts = hasPublishDates ? newest : featured;

  const heroMedia = campaigns[0]?.media[0] ?? (featured[0] ? primaryMedia(featured[0]) : null);
  const editorialMedia = pickEditorialMedia(featured, heroMedia);

  const hasCatalog = featured.length > 0;
  const archivedCount = collections.filter((collection) => collection.isArchived).length;

  return (
    <>
      <Hero media={heroMedia} />

      {/* ── PAPER — the showroom ────────────────────────────────────── */}
      <Section surface="paper" aria-labelledby="drop-heading">
        <SectionHeader
          id="drop-heading"
          eyebrow={hasPublishDates ? 'Current drop' : 'Now in store'}
          title={hasPublishDates ? 'New Arrivals' : 'The Drop'}
          action={
            <TextLink href={hasPublishDates ? '/shop?sort=newest' : '/shop'}>View all</TextLink>
          }
          className="mb-10 md:mb-14"
        />

        {hasCatalog ? (
          <ProductRack products={dropProducts} priorityCount={1} columns={4} />
        ) : (
          <EmptyState
            title="The catalogue is not loaded"
            body="Product data has not been imported into this build. No stand-in products have been invented to fill the space."
            action={
              <ButtonLink href="/about" variant="secondary" size="md">
                About INFNITY
              </ButtonLink>
            }
          />
        )}
      </Section>

      {/* ── VOID — the manifesto ────────────────────────────────────── */}
      <Section surface="void" spacing="loose" aria-labelledby="manifesto-heading">
        <Reveal className="mx-auto max-w-4xl">
          <div className="mb-8 flex items-center gap-4">
            <span aria-hidden className="bg-signal h-px w-12" />
            <p className="text-fg-faint text-[0.66rem] font-semibold tracking-[0.32em] uppercase">
              The label
            </p>
          </div>

          <h2
            id="manifesto-heading"
            className="font-display text-headline text-fg oblique text-balance"
          >
            Don&apos;t fold.
            <br />
            Don&apos;t follow.
            <br />
            <span className="text-signal">Never settle.</span>
          </h2>

          <p className="text-fg-muted mt-8 max-w-lg text-[0.95rem] leading-relaxed">
            INFNITY is where raw identity meets untouchable design. Every piece is made to be worn
            hard and to still read as a statement.
          </p>

          <div className="mt-10">
            <ButtonLink href="/about" variant="primary" size="lg">
              Read the story
            </ButtonLink>
          </div>
        </Reveal>
      </Section>

      {/* ── BONE — editorial. Only when there is a real photograph. ─── */}
      {editorialMedia && (
        <Section surface="bone" bleed spacing="none" aria-labelledby="editorial-heading">
          <div className="grid items-stretch md:grid-cols-2">
            <div data-surface="paper" className="bg-surface order-1 md:order-2">
              <MediaFrame
                src={editorialMedia.url}
                alt={editorialMedia.alt}
                sizes="(min-width: 768px) 50vw, 100vw"
                ratioClassName="aspect-[4/5] md:aspect-auto md:h-full md:min-h-[36rem]"
                fallbackLabel="INFNITY"
              />
            </div>

            <Reveal className="order-2 flex flex-col justify-center px-(--spacing-gutter) py-16 md:order-1 md:py-24">
              <p className="text-fg-faint mb-5 text-[0.66rem] font-semibold tracking-[0.32em] uppercase">
                Campaign
              </p>
              <h2
                id="editorial-heading"
                className="font-display text-headline text-fg max-w-[12ch] text-balance"
              >
                Worn hard.
                <br />
                Still a statement.
              </h2>
              <p className="text-fg-muted mt-6 max-w-sm text-sm leading-relaxed">
                Shot on the pieces themselves — no studio gloss, no borrowed imagery. What you see
                on the model is what arrives in the box.
              </p>
              <div className="mt-9">
                <TextLink href="/shop">Shop the campaign</TextLink>
              </div>
            </Reveal>
          </div>
        </Section>
      )}

      {/* ── INK — the Vault ─────────────────────────────────────────── */}
      <Section surface="ink" aria-labelledby="vault-heading">
        <Reveal className="border-line flex flex-col items-start gap-10 border px-6 py-16 md:flex-row md:items-center md:justify-between md:px-14 md:py-24">
          <div>
            <p className="text-fg-faint mb-5 text-[0.66rem] font-semibold tracking-[0.32em] uppercase">
              The archive
            </p>
            <h2 id="vault-heading" className="font-display text-headline text-fg oblique">
              Enter the Vault
            </h2>
            <p className="text-fg-muted mt-6 max-w-sm text-sm leading-relaxed">
              Past drops and retired pieces, kept on record. Not restocked, not reissued — still
              INFNITY.
            </p>
            {archivedCount > 0 && (
              <p className="text-fg-faint mt-5 text-[0.68rem] tracking-[0.18em] uppercase tabular-nums">
                {archivedCount} archived {archivedCount === 1 ? 'collection' : 'collections'}
              </p>
            )}
          </div>

          <ButtonLink href="/vault" variant="primary" size="lg" className="shrink-0">
            Enter
          </ButtonLink>
        </Reveal>
      </Section>

      {/* ── CONCRETE — essentials ───────────────────────────────────── */}
      {essentials.length > 0 && (
        <Section surface="concrete" aria-labelledby="essentials-heading">
          <SectionHeader
            id="essentials-heading"
            eyebrow="Core"
            title="The Essentials"
            lede="The pieces that stay in rotation between drops."
            action={<TextLink href="/shop">Shop the core</TextLink>}
            className="mb-10 md:mb-14"
          />
          <ProductGrid products={essentials} density="editorial" priorityCount={0} />
        </Section>
      )}

      {/* ── PAPER — the Troop. Only when real customer fits exist. ──── */}
      {ugc.length > 0 && (
        <Section surface="paper" aria-labelledby="troop-heading">
          <SectionHeader
            id="troop-heading"
            eyebrow="Styled by you"
            title="The Troop"
            action={<TextLink href="/troop">See the gallery</TextLink>}
            className="mb-10 md:mb-14"
          />
          <TroopGallery entries={ugc} />
        </Section>
      )}
    </>
  );
}

/**
 * The editorial slot wants an on-model shot, and specifically not the one
 * already used in the hero — repeating a single asset twice on one page is the
 * tell that a storefront has no photography rather than a design decision.
 * Returns null when the catalogue genuinely has nothing else, and the section
 * is dropped entirely.
 */
function pickEditorialMedia(
  products: readonly Product[],
  exclude: ProductMedia | null,
): ProductMedia | null {
  for (const product of products) {
    const candidate = orderedMedia(product).find(
      (item) => item.kind === 'model' && item.url !== exclude?.url,
    );
    if (candidate) return candidate;
  }
  for (const product of products) {
    const candidate = orderedMedia(product).find((item) => item.url !== exclude?.url);
    if (candidate) return candidate;
  }
  return null;
}
