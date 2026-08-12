import type { Metadata } from 'next';
import { Suspense } from 'react';

import { Section } from '@/components/layout/Section';
import { CatalogChips } from '@/components/shop/CatalogChips';
import { CatalogGrid } from '@/components/shop/CatalogGrid';
import { ShopControls } from '@/components/shop/ShopControls';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { catalogRepository } from '@/data';
import { availableGroups, categoryGroupOf } from '@/domain/taxonomy';
import { parseShopParams, type RawSearchParams } from '@/lib/shop-params';

export const metadata: Metadata = {
  title: 'Shop',
  description: 'Every INFNITY piece currently available. Heavyweight streetwear built to last.',
  alternates: { canonical: '/shop' },
};

/**
 * The catalogue.
 *
 * A showroom, not a database view. The 1.0 layout gave a permanent filter rail a
 * quarter of the desktop width and set the products in what was left; here the
 * catalogue owns the full width, filtering lives behind one control, and the
 * section chips carry the browsing that most customers actually do.
 *
 * Bone rather than white: the grid's own product plates are white, so a bone
 * page turns every card into a lit frame instead of letting the images bleed
 * into the background.
 */
export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const { filters, sort, activeCount, group } = parseShopParams(params);

  const [{ products: matched, facets }, everything, collections] = await Promise.all([
    catalogRepository.listProducts({ filters, sort }),
    catalogRepository.listProducts(),
    catalogRepository.listCollections(),
  ]);

  /**
   * The chip narrows *after* the query, because the group is derived from the
   * product's own name by `domain/taxonomy` rather than stored on the record —
   * the repository can only filter on what the data actually says.
   */
  const products = group
    ? matched.filter((product) => categoryGroupOf(product) === group)
    : matched;

  const total = products.length;
  const groups = availableGroups(everything.products);

  const collectionNames = Object.fromEntries(
    collections.map((collection) => [collection.slug, collection.name]),
  );

  const isCatalogEmpty = everything.total === 0;

  return (
    <Section surface="bone" spacing="none" className="pt-12 pb-(--spacing-section) md:pt-16">
      <header className="mb-8 md:mb-10">
        <p className="text-fg-faint mb-4 text-[0.66rem] font-semibold tracking-[0.32em] uppercase">
          Shop
        </p>
        <h1 className="font-display text-headline text-fg oblique">All Pieces</h1>
      </header>

      <div className="mb-8">
        <CatalogChips groups={groups} activeGroup={group} isNewest={sort === 'newest' && !group} />
      </div>

      {/* The control row is a rule with the count on one side and filtering on
          the other — the catalogue's status line, not a toolbar. */}
      <div className="border-line mb-12 flex flex-wrap items-center justify-between gap-4 border-y py-4 md:mb-16">
        <p className="text-fg-muted text-[0.66rem] tracking-[0.18em] uppercase tabular-nums">
          {total} {total === 1 ? 'piece' : 'pieces'}
        </p>

        <div className="flex items-center gap-5">
          {/* useSearchParams needs a Suspense boundary for static rendering. */}
          <Suspense fallback={<div className="bg-surface-sunken h-11 w-36" />}>
            <ShopControls
              facets={facets}
              sort={sort}
              activeCount={activeCount}
              resultCount={total}
              collectionNames={collectionNames}
            />
          </Suspense>
        </div>
      </div>

      {products.length > 0 ? (
        <CatalogGrid products={products} />
      ) : isCatalogEmpty ? (
        <EmptyState
          title="The catalogue is not loaded"
          body="Product data has not been imported into this build. Nothing has been invented to stand in for it."
          action={
            <ButtonLink href="/about" variant="secondary" size="md">
              About INFNITY
            </ButtonLink>
          }
        />
      ) : (
        <EmptyState
          title="Nothing matches"
          body="No piece fits that combination right now. Widening the search will bring the rest of the catalogue back."
          action={
            <ButtonLink href="/shop" variant="primary" size="md">
              Show everything
            </ButtonLink>
          }
        />
      )}
    </Section>
  );
}
