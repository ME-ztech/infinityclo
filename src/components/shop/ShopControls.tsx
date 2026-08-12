'use client';

/**
 * Filter and sort controls.
 *
 * State lives entirely in the URL — there is no local mirror to fall out of
 * sync. On desktop the facets sit in a sidebar; below `lg` they move into a
 * drawer, because a phone has no room for a persistent filter rail and an
 * accordion above the grid pushes the products off-screen.
 *
 * Only facets the data actually supports are rendered. A size filter appears
 * because sizes exist in the catalog, never because a shop template expects one.
 */
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import type { FacetCounts, ProductSort } from '@/domain/types';
import { track } from '@/lib/analytics';
import { cn } from '@/lib/cn';
import { clearFilters, SORT_OPTIONS, toggleFacetValue } from '@/lib/shop-params';
import { useFocusTrap } from '@/lib/useFocusTrap';

interface ShopControlsProps {
  facets: FacetCounts;
  sort: ProductSort;
  activeCount: number;
  resultCount: number;
  /** Collection slug -> display name, so facet chips read as names not slugs. */
  collectionNames: Readonly<Record<string, string>>;
}

export function ShopControls(props: ShopControlsProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  return (
    <>
      {/* Mobile bar */}
      <div className="flex items-center justify-between gap-3 lg:hidden">
        <button
          type="button"
          onClick={() => setIsDrawerOpen(true)}
          data-testid="filter-open"
          className="border-ash text-bone hover:border-bone inline-flex h-11 items-center gap-2 border px-4 text-[0.7rem] font-semibold tracking-[0.14em] uppercase"
        >
          Filter
          {props.activeCount > 0 && (
            <span className="bg-paper text-void flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[0.6rem] font-bold">
              {props.activeCount}
            </span>
          )}
        </button>

        <SortSelect sort={props.sort} />
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <div className="mb-8 flex items-center justify-between gap-4">
          <p className="text-dim text-[0.7rem] tracking-[0.14em] uppercase">
            {props.resultCount} {props.resultCount === 1 ? 'piece' : 'pieces'}
          </p>
          <SortSelect sort={props.sort} />
        </div>
        <FacetList {...props} />
      </div>

      {isDrawerOpen && <FilterDrawer {...props} onClose={() => setIsDrawerOpen(false)} />}
    </>
  );
}

function SortSelect({ sort }: { sort: ProductSort }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="shop-sort" className="text-dim text-[0.7rem] tracking-[0.14em] uppercase">
        Sort
      </label>
      <select
        id="shop-sort"
        value={sort}
        data-testid="sort-select"
        onChange={(event) => {
          const next = new URLSearchParams(searchParams.toString());
          next.set('sort', event.target.value);
          router.push(`?${next.toString()}`, { scroll: false });
        }}
        className="border-ash text-bone focus:border-bone h-11 border bg-transparent px-3 text-xs outline-none"
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value} className="bg-ink">
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function FacetList({ facets, activeCount, collectionNames }: ShopControlsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function toggle(key: string, value: string) {
    const next = toggleFacetValue(searchParams, key, value);
    track({ name: 'filter_applied', filter: key, value });
    router.push(next.toString() ? `?${next.toString()}` : '?', { scroll: false });
  }

  const isChecked = (key: string, value: string) =>
    searchParams
      .getAll(key)
      .flatMap((entry) => entry.split(','))
      .includes(value);

  return (
    <div className="flex flex-col gap-8">
      {activeCount > 0 && (
        <button
          type="button"
          data-testid="clear-filters"
          onClick={() => {
            const next = clearFilters(searchParams);
            router.push(next.toString() ? `?${next.toString()}` : '?', { scroll: false });
          }}
          className="text-paper self-start text-[0.7rem] font-semibold tracking-[0.14em] uppercase underline underline-offset-4"
        >
          Clear all ({activeCount})
        </button>
      )}

      <FacetGroup
        title="Availability"
        options={[{ value: 'true', label: 'In stock only', count: null }]}
        isChecked={() => searchParams.get('available') === 'true'}
        onToggle={() => {
          const next = new URLSearchParams(searchParams.toString());
          if (next.get('available') === 'true') next.delete('available');
          else next.set('available', 'true');
          router.push(next.toString() ? `?${next.toString()}` : '?', { scroll: false });
        }}
      />

      {facets.sizes.length > 0 && (
        <FacetGroup
          title="Size"
          options={facets.sizes.map((s) => ({ value: s.value, label: s.value, count: s.count }))}
          isChecked={(value) => isChecked('size', value)}
          onToggle={(value) => toggle('size', value)}
        />
      )}

      {facets.colours.length > 0 && (
        <FacetGroup
          title="Colour"
          options={facets.colours.map((c) => ({ value: c.value, label: c.value, count: c.count }))}
          isChecked={(value) => isChecked('colour', value)}
          onToggle={(value) => toggle('colour', value)}
        />
      )}

      {facets.categories.length > 0 && (
        <FacetGroup
          title="Category"
          options={facets.categories.map((c) => ({
            value: c.value,
            label: c.value,
            count: c.count,
          }))}
          isChecked={(value) => isChecked('category', value)}
          onToggle={(value) => toggle('category', value)}
        />
      )}

      {facets.collections.length > 0 && (
        <FacetGroup
          title="Collection"
          options={facets.collections.map((c) => ({
            value: c.value,
            label: collectionNames[c.value] ?? c.value,
            count: c.count,
          }))}
          isChecked={(value) => isChecked('collection', value)}
          onToggle={(value) => toggle('collection', value)}
        />
      )}
    </div>
  );
}

function FacetGroup({
  title,
  options,
  isChecked,
  onToggle,
}: {
  title: string;
  options: ReadonlyArray<{ value: string; label: string; count: number | null }>;
  isChecked: (value: string) => boolean;
  onToggle: (value: string) => void;
}) {
  return (
    <fieldset>
      <legend className="text-dim mb-4 text-[0.68rem] font-semibold tracking-[0.2em] uppercase">
        {title}
      </legend>
      <div className="flex flex-col gap-3">
        {options.map((option) => {
          const checked = isChecked(option.value);
          return (
            <label
              key={option.value}
              className="group flex cursor-pointer items-center gap-3 text-sm"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(option.value)}
                className="sr-only"
              />
              <span
                aria-hidden
                className={cn(
                  'flex h-4 w-4 shrink-0 items-center justify-center border transition-colors',
                  checked ? 'border-paper bg-paper' : 'border-ash group-hover:border-bone',
                )}
              >
                {checked && (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden>
                    <path
                      d="M1 4l2.5 2.5L9 1"
                      stroke="#050505"
                      strokeWidth="1.75"
                      strokeLinecap="square"
                    />
                  </svg>
                )}
              </span>
              <span className={cn('flex-1', checked ? 'text-paper' : 'text-bone/85')}>
                {option.label}
              </span>
              {option.count !== null && (
                <span className="text-dim text-xs tabular-nums">{option.count}</span>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function FilterDrawer(props: ShopControlsProps & { onClose: () => void }) {
  const containerRef = useFocusTrap(true, props.onClose);

  return (
    <div className="fixed inset-0 z-[85] lg:hidden" data-testid="filter-drawer">
      <button
        type="button"
        aria-label="Close filters"
        onClick={props.onClose}
        className="bg-void/70 absolute inset-0 h-full w-full cursor-default"
        tabIndex={-1}
      />

      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Filters"
        tabIndex={-1}
        className="bg-ink border-ash absolute inset-y-0 left-0 flex w-full max-w-sm flex-col border-r"
      >
        <div className="border-ash/50 flex h-16 shrink-0 items-center justify-between border-b px-5">
          <h2 className="text-xs font-semibold tracking-[0.18em] uppercase">Filter</h2>
          <button
            type="button"
            onClick={props.onClose}
            aria-label="Close filters"
            className="text-bone hover:text-paper -mr-2 p-3"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path d="m4 4 12 12M16 4 4 16" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <FacetList {...props} />
        </div>

        <div className="border-ash/50 shrink-0 border-t p-5">
          <Button variant="primary" size="md" fullWidth onClick={props.onClose}>
            Show {props.resultCount} {props.resultCount === 1 ? 'piece' : 'pieces'}
          </Button>
        </div>
      </div>
    </div>
  );
}
