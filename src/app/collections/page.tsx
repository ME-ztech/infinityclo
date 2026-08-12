import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { catalogRepository } from '@/data';

export const metadata: Metadata = {
  title: 'Collections',
  description: 'Every INFNITY collection, past and present.',
  alternates: { canonical: '/collections' },
};

export const revalidate = 3600;

export default async function CollectionsPage() {
  const collections = await catalogRepository.listCollections();

  return (
    <div className="edge pt-28 pb-[--spacing-section] md:pt-36">
      <header className="mb-12">
        <h1 className="font-display text-headline text-paper">Collections</h1>
        <p className="text-smoke mt-3 max-w-md text-sm leading-relaxed">
          Every drop, grouped as it was released.
        </p>
      </header>

      {collections.length > 0 ? (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {collections.map((collection) => (
            <li key={collection.slug}>
              <Link
                href={`/collections/${collection.slug}`}
                className="group border-ash/50 block border"
              >
                <div className="bg-carbon relative aspect-[--aspect-editorial] overflow-hidden">
                  {collection.heroMedia ? (
                    <Image
                      src={collection.heroMedia.url}
                      alt={collection.heroMedia.alt}
                      fill
                      sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                      className="object-cover transition-transform duration-700 ease-[--ease-brand] group-hover:scale-105"
                    />
                  ) : (
                    <div className="text-dim absolute inset-0 flex items-center justify-center">
                      <span className="font-display text-2xl tracking-[0.16em] opacity-25">
                        {collection.name}
                      </span>
                    </div>
                  )}
                </div>

                <div className="p-5">
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="text-paper font-display text-lg">{collection.name}</h2>
                    {collection.dropLabel && (
                      <span className="text-dim text-[0.68rem] tracking-[0.14em] uppercase">
                        {collection.dropLabel}
                      </span>
                    )}
                  </div>
                  <p className="text-dim mt-2 text-[0.7rem] tracking-[0.12em] uppercase">
                    {collection.productSlugs.length}{' '}
                    {collection.productSlugs.length === 1 ? 'piece' : 'pieces'}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title="No collections loaded"
          body="Collection data has not been imported into this build yet."
          action={
            <ButtonLink href="/shop" variant="secondary" size="md">
              Shop all
            </ButtonLink>
          }
        />
      )}
    </div>
  );
}
