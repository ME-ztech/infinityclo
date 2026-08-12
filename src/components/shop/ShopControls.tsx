'use client';

/**
 * Filter and sort.
 *
 * 1.0 gave desktop a permanent 260px filter rail. That rail cost the catalogue a
 * quarter of its width on every screen — including the many sessions where
 * nobody filters at all — and it made the shop read as a database view rather
 * than a showroom. 1.1 collapses filtering and sorting into one refined control
 * at every breakpoint, and hands the reclaimed width to the photography.
 *
 * State lives entirely in the URL; there is no local mirror to fall out of sync.
 * Only facets the data actually supports are rendered: a size filter appears
 * because sizes exist in the catalogue, never because a shop template expects
 * one.
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
  const [isOpen, setIsOpen] = useState(false);
  const activeSortLabel =
    SORT_OPTIONS.find((option) => option.value === props.sort)?.label ?? 'Featured';

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        data-testid="filter-open"
        aria-expanded={isOpen}
        className="border-line text-fg hover:border-fg group inline-flex h-11 items-center gap-3 border px-5 text-[0.66rem] font-semibold tracking-[0.2em] uppercase transition-colors"
      >
        <span>Filter / Sort</span>
        {props.activeCount > 0 && (
          <span className="bg-signal text-paper flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[0.56rem] font-bold tabular-nums">
            {props.activeCount}
          </span>
        )}
        <span
          aria-hidden
          className="text-fg-faint group-hover:text-fg text-base leading-none transition-colors"
        >
          +
        </span>
      </button>

      {/* The current sort is stated outside the drawer so a customer can see how
          the catalogue is ordered without opening anything. */}
      <p className="text-fg-faint hidden text-[0.66rem] tracking-[0.18em] uppercase sm:block">
        Sorted: <span className="text-fg-muted">{activeSortLabel}</span>
      </p>

      {isOpen && <FilterDrawer {...props} onClose={() => setIsOpen(false)} />}
    </>
  );
}

function FilterDrawer(props: ShopControlsProps & { onClose: () => void }) {
  const containerRef = useFocusTrap(true, props.onClose);
  const router = useRouter();
  const searchParams = useSearchParams();

  function push(next: URLSearchParams) {
    router.push(next.toString() ? `?${next.toString()}` : '?', { scroll: false });
  }

  function toggle(key: string, value: string) {
    track({ name: 'filter_applied', filter: key, value });
    push(toggleFacetValue(searchParams, key, value));
  }

  const isChecked = (key: string, value: string) =>
    searchParams
      .getAll(key)
      .flatMap((entry) => entry.split(','))
      .includes(value);

  return (
    <div className="fixed inset-0 z-[85]" data-testid="filter-drawer">
      <button
        type="button"
        aria-label="Close filters"
        onClick={props.onClose}
        className="bg-void/55 absolute inset-0 h-full w-full animate-[fade-in_200ms_ease-out] cursor-default"
        tabIndex={-1}
      />

      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Filter and sort"
        tabIndex={-1}
        data-surface="bone"
        className="bg-surface text-fg border-line absolute inset-y-0 right-0 flex w-full max-w-sm translate-x-0 flex-col border-l shadow-[-1px_0_40px_rgba(0,0,0,0.14)]"
      >
        <div className="border-line flex h-16 shrink-0 items-center justify-between border-b px-5">
          <h2 className="text-[0.68rem] font-semibold tracking-[0.22em] uppercase">
            Filter / Sort
          </h2>
          <button
            type="button"
            onClick={props.onClose}
            aria-label="Close filters"
            className="text-fg-faint hover:text-fg -mr-2 p-3 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path d="m4 4 12 12M16 4 4 16" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-9 overflow-y-auto p-5">
          <fieldset>
            <legend className="text-fg-faint mb-4 text-[0.64rem] font-semibold tracking-[0.24em] uppercase">
              Sort
            </legend>
            <div className="flex flex-col">
              {SORT_OPTIONS.map((option) => {
                const isActive = props.sort === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    data-testid="sort-option"
                    onClick={() => {
                      const next = new URLSearchParams(searchParams.toString());
                      next.set('sort', option.value);
                      push(next);
                    }}
                    aria-pressed={isActive}
                    className={cn(
                      'flex min-h-11 items-center justify-between py-2 text-left text-sm transition-colors',
                      isActive ? 'text-fg font-semibold' : 'text-fg-muted hover:text-fg',
                    )}
                  >
                    {option.label}
                    {isActive && (
                      <span className="bg-signal h-1.5 w-1.5 rounded-full" aria-hidden />
                    )}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {props.activeCount > 0 && (
            <button
              type="button"
              data-testid="clear-filters"
              onClick={() => push(clearFilters(searchParams))}
              className="text-signal self-start text-[0.66rem] font-semibold tracking-[0.18em] uppercase underline underline-offset-4"
            >
              Clear all ({props.activeCount})
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
              push(next);
            }}
          />

          {props.facets.sizes.length > 0 && (
            <FacetGroup
              title="Size"
              options={props.facets.sizes.map((s) => ({
                value: s.value,
                label: s.value,
                count: s.count,
              }))}
              isChecked={(value) => isChecked('size', value)}
              onToggle={(value) => toggle('size', value)}
            />
          )}

          {props.facets.colours.length > 0 && (
            <FacetGroup
              title="Colour"
              options={props.facets.colours.map((c) => ({
                value: c.value,
                label: c.value,
                count: c.count,
              }))}
              isChecked={(value) => isChecked('colour', value)}
              onToggle={(value) => toggle('colour', value)}
            />
          )}

          {props.facets.categories.length > 0 && (
            <FacetGroup
              title="Category"
              options={props.facets.categories.map((c) => ({
                value: c.value,
                label: c.value,
                count: c.count,
              }))}
              isChecked={(value) => isChecked('category', value)}
              onToggle={(value) => toggle('category', value)}
            />
          )}

          {props.facets.collections.length > 0 && (
            <FacetGroup
              title="Collection"
              options={props.facets.collections.map((c) => ({
                value: c.value,
                label: props.collectionNames[c.value] ?? c.value,
                count: c.count,
              }))}
              isChecked={(value) => isChecked('collection', value)}
              onToggle={(value) => toggle('collection', value)}
            />
          )}
        </div>

        <div className="border-line shrink-0 border-t p-5">
          <Button variant="primary" size="md" fullWidth onClick={props.onClose}>
            Show {props.resultCount} {props.resultCount === 1 ? 'piece' : 'pieces'}
          </Button>
        </div>
      </div>
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
      <legend className="text-fg-faint mb-4 text-[0.64rem] font-semibold tracking-[0.24em] uppercase">
        {title}
      </legend>
      <div className="flex flex-col gap-1">
        {options.map((option) => {
          const checked = isChecked(option.value);
          return (
            <label
              key={option.value}
              className="group flex min-h-11 cursor-pointer items-center gap-3 text-sm"
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
                  'flex h-[18px] w-[18px] shrink-0 items-center justify-center border transition-colors',
                  checked
                    ? 'border-inverse-surface bg-inverse-surface'
                    : 'border-field group-hover:border-fg',
                )}
              >
                {checked && (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden>
                    <path
                      d="M1 4l2.5 2.5L9 1"
                      stroke="currentColor"
                      className="text-inverse-fg"
                      strokeWidth="1.9"
                      strokeLinecap="square"
                    />
                  </svg>
                )}
              </span>
              <span className={cn('flex-1', checked ? 'text-fg font-medium' : 'text-fg-muted')}>
                {option.label}
              </span>
              {option.count !== null && (
                <span className="text-fg-faint text-xs tabular-nums">{option.count}</span>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
