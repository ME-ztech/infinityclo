import type { Metadata } from 'next';
import Link from 'next/link';

import { ProductGrid } from '@/components/product/ProductGrid';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { catalogRepository } from '@/data';
import { isSoldOut } from '@/domain/product';

export const metadata: Metadata = {
  title: 'The Vault',
  description: 'The INFNITY archive. Past drops, old stories, still INFNITY.',
  alternates: { canonical: '/vault' },
};

export const revalidate = 3600;

export default async function VaultPage() {
  const [collections, { products }] = await Promise.all([
    catalogRepository.listCollections(),
    catalogRepository.listProducts(),
  ]);

  // The Vault is the archive, not a sale rail: it holds collections explicitly
  // marked archived, plus pieces that have sold through. Release dates and drop
  // labels render only where the source data actually carried them — no season
  // has been reconstructed from a publication timestamp.
  const archivedCollections = collections.filter((collection) => collection.isArchived);
  const soldOutPieces = products.filter(isSoldOut);

  const hasArchive = archivedCollections.length > 0 || soldOutPieces.length > 0;

  return (
    <div>
      <section className="edge flex min-h-[70svh] items-end pt-28 pb-16 md:pt-36">
        <div>
          <p className="text-dim mb-5 text-[0.7rem] font-semibold tracking-[0.3em] uppercase">
            The archive
          </p>
          <h1 className="font-display text-statement text-paper">Enter the Vault</h1>
          <p className="font-display text-smoke mt-8 text-xl leading-tight tracking-[0.06em] md:text-3xl">
            Past drops.
            <br />
            Old stories.
            <br />
            Still INFNITY.
          </p>
        </div>
      </section>

      <div className="edge pb-[--spacing-section]">
        {!hasArchive ? (
          <EmptyState
            title="The Vault is sealed"
            body={
              <>
                Archive data has not been imported into this build. Past drops appear here as they
                are catalogued — no collection history has been invented to fill the space.
              </>
            }
            action={
              <ButtonLink href="/shop" variant="primary" size="md">
                Shop current
              </ButtonLink>
            }
          />
        ) : (
          <>
            {archivedCollections.length > 0 && (
              <section aria-labelledby="archive-collections" className="mb-[--spacing-section]">
                <h2
                  id="archive-collections"
                  className="text-dim mb-8 text-[0.68rem] font-semibold tracking-[0.24em] uppercase"
                >
                  Archived collections
                </h2>

                <ul className="border-ash/50 border-t">
                  {archivedCollections.map((collection) => (
                    <li key={collection.slug} className="border-ash/50 border-b">
                      <Link
                        href={`/collections/${collection.slug}`}
                        className="group flex items-baseline justify-between gap-6 py-6 transition-colors"
                      >
                        <span className="font-display text-paper group-hover:text-bone text-2xl md:text-4xl">
                          {collection.name}
                        </span>
                        <span className="text-dim shrink-0 text-[0.7rem] tracking-[0.14em] uppercase">
                          {collection.dropLabel ?? `${collection.productSlugs.length} pieces`}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {soldOutPieces.length > 0 && (
              <section aria-labelledby="archive-pieces">
                <h2
                  id="archive-pieces"
                  className="text-dim mb-8 text-[0.68rem] font-semibold tracking-[0.24em] uppercase"
                >
                  Sold through
                </h2>
                <ProductGrid products={soldOutPieces} density="comfortable" priorityCount={0} />
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
