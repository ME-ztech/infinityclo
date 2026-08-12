import type { Metadata } from 'next';

import { ProductGrid } from '@/components/product/ProductGrid';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { catalogRepository } from '@/data';
import type { RawSearchParams } from '@/lib/shop-params';

export const metadata: Metadata = {
  title: 'Search',
  // Search result pages carry no unique content worth indexing and would
  // fragment the catalog's canonical identity across query permutations.
  robots: { index: false, follow: true },
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const term = typeof params.q === 'string' ? params.q.trim() : '';

  const results = term ? await catalogRepository.searchProducts(term, 48) : [];

  return (
    <div className="edge pt-28 pb-[--spacing-section] md:pt-36">
      <header className="mb-10">
        <h1 className="font-display text-headline text-paper">Search</h1>
        {term && (
          <p className="text-smoke mt-3 text-sm">
            {results.length} {results.length === 1 ? 'result' : 'results'} for “{term}”
          </p>
        )}
      </header>

      {!term ? (
        <EmptyState
          title="Search the catalog"
          body="Use the search icon in the header to look for a piece by name, category or colour."
          action={
            <ButtonLink href="/shop" variant="secondary" size="md">
              Browse everything
            </ButtonLink>
          }
        />
      ) : results.length > 0 ? (
        <ProductGrid products={results} density="comfortable" priorityCount={4} />
      ) : (
        <EmptyState
          title={`Nothing matched “${term}”`}
          body="Try a shorter or more general term."
          action={
            <ButtonLink href="/shop" variant="primary" size="md">
              Shop all
            </ButtonLink>
          }
        />
      )}
    </div>
  );
}
