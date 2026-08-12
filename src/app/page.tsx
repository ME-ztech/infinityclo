import Link from 'next/link';

import { Hero } from '@/components/home/Hero';
import { SectionHeading } from '@/components/home/SectionHeading';
import { TroopGallery } from '@/components/troop/TroopGallery';
import { ProductGrid } from '@/components/product/ProductGrid';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { catalogRepository, contentRepository } from '@/data';
import { primaryMedia } from '@/domain/product';

export const revalidate = 3600;

export default async function HomePage() {
  const [{ products: newest }, { products: featured }, collections, ugc, campaigns] =
    await Promise.all([
      catalogRepository.listProducts({ sort: 'newest', limit: 8 }),
      catalogRepository.listProducts({ sort: 'featured', limit: 4 }),
      catalogRepository.listCollections(),
      contentRepository.listUGC(8),
      contentRepository.listCampaigns(),
    ]);

  // The hero uses a campaign asset when one exists, otherwise the newest
  // product's lead shot, otherwise pure type. Never a stock image.
  const heroMedia =
    campaigns[0]?.media[0] ?? (newest[0] ? primaryMedia(newest[0]) : null) ?? null;

  const hasCatalog = newest.length > 0;
  const archivedCollections = collections.filter((collection) => collection.isArchived);

  return (
    <>
      <Hero media={heroMedia} />

      {/* CURRENT DROP ------------------------------------------------ */}
      <section className="edge pt-[--spacing-section]" aria-labelledby="drop-heading">
        <SectionHeading
          eyebrow="Current drop"
          title="New Arrivals"
          href="/shop?sort=newest"
          className="mb-10"
        />

        {hasCatalog ? (
          <ProductGrid products={newest} density="comfortable" priorityCount={2} />
        ) : (
          <EmptyState
            title="The catalog is not loaded"
            body={
              <>
                Product data has not been imported into this build yet. No stand-in
                products have been invented to fill the space.
              </>
            }
            action={
              <ButtonLink href="/about" variant="secondary" size="md">
                About INFNITY
              </ButtonLink>
            }
          />
        )}
      </section>

      {/* EDITORIAL --------------------------------------------------- */}
      <section
        className="edge pt-[--spacing-section]"
        aria-labelledby="editorial-heading"
      >
        <div className="border-ash/50 grid items-stretch gap-0 border md:grid-cols-2">
          <div className="flex flex-col justify-center px-6 py-14 md:px-12 md:py-20">
            <p className="text-dim mb-4 text-[0.68rem] font-semibold tracking-[0.24em] uppercase">
              The label
            </p>
            <h2 id="editorial-heading" className="font-display text-headline text-paper text-balance">
              Don&apos;t fold.
              <br />
              Don&apos;t follow.
            </h2>
            <p className="text-smoke mt-6 max-w-sm text-sm leading-relaxed">
              INFNITY is built on raw identity and construction that holds its shape.
              Every piece is made to be worn hard and to still read as a statement.
            </p>
            <div className="mt-8">
              <ButtonLink href="/about" variant="secondary" size="md">
                Read the story
              </ButtonLink>
            </div>
          </div>

          <div className="border-ash/50 relative min-h-[320px] border-t md:min-h-[520px] md:border-t-0 md:border-l">
            {/* Editorial imagery slots in here at import. Until then the panel
                holds its proportion rather than collapsing the layout. */}
            <div className="text-dim absolute inset-0 flex items-center justify-center">
              <span className="font-display text-4xl tracking-[0.2em] opacity-20 md:text-6xl">
                INFNITY
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* THE VAULT --------------------------------------------------- */}
      <section className="edge pt-[--spacing-section]" aria-labelledby="vault-heading">
        <div className="bg-ink border-ash/50 border px-6 py-16 text-center md:px-12 md:py-24">
          <p className="text-dim mb-5 text-[0.68rem] font-semibold tracking-[0.24em] uppercase">
            The archive
          </p>
          <h2 id="vault-heading" className="font-display text-headline text-paper">
            Enter the Vault
          </h2>
          <p className="font-display text-smoke mt-6 text-lg leading-tight tracking-[0.06em] md:text-2xl">
            Past drops.
            <br />
            Old stories.
            <br />
            Still INFNITY.
          </p>
          <div className="mt-9">
            <ButtonLink href="/vault" variant="primary" size="lg">
              Enter
            </ButtonLink>
          </div>
          {archivedCollections.length > 0 && (
            <p className="text-dim mt-6 text-[0.7rem] tracking-[0.14em] uppercase">
              {archivedCollections.length} archived{' '}
              {archivedCollections.length === 1 ? 'collection' : 'collections'}
            </p>
          )}
        </div>
      </section>

      {/* CORE PIECES ------------------------------------------------- */}
      {featured.length > 0 && (
        <section className="edge pt-[--spacing-section]" aria-labelledby="core-heading">
          <SectionHeading eyebrow="Core" title="The Essentials" href="/shop" className="mb-10" />
          <ProductGrid products={featured} density="editorial" priorityCount={0} />
        </section>
      )}

      {/* THE TROOP --------------------------------------------------- */}
      <section className="edge pt-[--spacing-section]" aria-labelledby="troop-heading">
        <SectionHeading
          eyebrow="Styled by you"
          title="The Troop"
          href="/troop"
          linkLabel="See the gallery"
          className="mb-10"
        />

        {ugc.length > 0 ? (
          <TroopGallery entries={ugc} />
        ) : (
          <EmptyState
            title="The gallery is waiting"
            body={
              <>
                Customer fits have not been imported into this build. Real INFNITY
                customers go here — nothing is being staged in the meantime.
              </>
            }
            action={
              <Link
                href="/troop"
                className="text-paper text-xs font-semibold tracking-[0.16em] uppercase underline underline-offset-4"
              >
                About The Troop
              </Link>
            }
          />
        )}
      </section>
    </>
  );
}
