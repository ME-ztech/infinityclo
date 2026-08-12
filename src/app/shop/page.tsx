import type { Metadata } from 'next';
import { Suspense } from 'react';

import { ProductGrid } from '@/components/product/ProductGrid';
import { ShopControls } from '@/components/shop/ShopControls';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { catalogRepository } from '@/data';
import { parseShopParams, type RawSearchParams } from '@/lib/shop-params';

export const metadata: Metadata = {
  title: 'Shop',
  description: 'Every INFNITY piece currently available. Heavyweight streetwear built to last.',
  alternates: { canonical: '/shop' },
};

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const { filters, sort, activeCount } = parseShopParams(params);

  const [{ products, total, facets }, collections] = await Promise.all([
    catalogRepository.listProducts({ filters, sort }),
    catalogRepository.listCollections(),
  ]);

  const collectionNames = Object.fromEntries(
    collections.map((collection) => [collection.slug, collection.name]),
  );

  const isCatalogEmpty = total === 0 && activeCount === 0;

  return (
    <div className="edge pt-28 pb-[--spacing-section] md:pt-36">
      <header className="mb-10 md:mb-14">
        <h1 className="font-display text-headline text-paper">Shop</h1>
        <p className="text-smoke mt-3 text-sm">
          {total} {total === 1 ? 'piece' : 'pieces'}
        </p>
      </header>

      <div className="grid gap-10 lg:grid-cols-[260px_1fr] lg:gap-14">
        <aside aria-label="Filters">
          {/* useSearchParams needs a Suspense boundary for static rendering. */}
          <Suspense fallback={<div className="bg-carbon h-11 w-32 animate-pulse" />}>
            <ShopControls
              facets={facets}
              sort={sort}
              activeCount={activeCount}
              resultCount={total}
              collectionNames={collectionNames}
            />
          </Suspense>
        </aside>

        <div>
          {products.length > 0 ? (
            <ProductGrid products={products} density="comfortable" priorityCount={4} />
          ) : isCatalogEmpty ? (
            <EmptyState
              title="The catalog is not loaded"
              body="Product data has not been imported into this build yet. Nothing has been invented to stand in for it."
              action={
                <ButtonLink href="/about" variant="secondary" size="md">
                  About INFNITY
                </ButtonLink>
              }
            />
          ) : (
            <EmptyState
              title="Nothing matches those filters"
              body="Try removing a filter to widen the search."
              action={
                <ButtonLink href="/shop" variant="primary" size="md">
                  Clear filters
                </ButtonLink>
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
