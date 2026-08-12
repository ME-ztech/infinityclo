import Link from 'next/link';

import type { CategoryGroupDefinition, CategoryGroup } from '@/domain/taxonomy';
import { cn } from '@/lib/cn';
import { RACK, RACK_ITEM } from '@/lib/rack';

/**
 * Catalogue section chips.
 *
 * Plain links, rendered on the server. There is no client state here at all —
 * the URL *is* the state, so a chip is shareable, survives the back button, and
 * costs nothing in JavaScript. It also means the active chip is correct on first
 * paint rather than after hydration.
 *
 * Chips are built from the groups the catalogue actually contains, so a BOTTOMS
 * chip never appears on a storefront currently selling none.
 *
 * The rail scrolls horizontally below `sm`. Seven chips will not fit on a 390px
 * phone at a legible size, and wrapping them into two ragged rows looks like a
 * mistake; a rail reads as a deliberate control and keeps the row height fixed.
 */
export function CatalogChips({
  groups,
  activeGroup,
  isNewest,
}: {
  groups: readonly CategoryGroupDefinition[];
  activeGroup: CategoryGroup | null;
  isNewest: boolean;
}) {
  const isAll = activeGroup === null && !isNewest;

  return (
    <nav aria-label="Catalogue sections">
      <ul
        className={cn(
          RACK,
          '-mx-(--spacing-gutter) gap-2 px-(--spacing-gutter)',
          'sm:mx-0 sm:snap-none sm:flex-wrap sm:overflow-visible sm:px-0',
        )}
      >
        <li className={RACK_ITEM}>
          <Chip href="/shop" isActive={isAll}>
            All
          </Chip>
        </li>
        <li className={RACK_ITEM}>
          <Chip href="/shop?sort=newest" isActive={isNewest}>
            New
          </Chip>
        </li>
        {groups.map((group) => (
          <li key={group.id} className={RACK_ITEM}>
            <Chip href={`/shop?group=${group.id}`} isActive={activeGroup === group.id}>
              {group.label}
            </Chip>
          </li>
        ))}
        <li>
          {/* The Vault is a room, not a filter — it has its own page and its own
              surface, so linking a filter chip at it would be a lie about where
              the customer is about to end up. */}
          <Chip href="/vault" isActive={false}>
            Vault
          </Chip>
        </li>
      </ul>
    </nav>
  );
}

function Chip({
  href,
  isActive,
  children,
}: {
  href: string;
  isActive: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'inline-flex h-11 items-center border px-5 text-[0.66rem] font-semibold tracking-[0.2em] whitespace-nowrap uppercase transition-colors duration-200',
        isActive
          ? 'border-inverse-surface bg-inverse-surface text-inverse-fg'
          : 'border-line text-fg-muted hover:border-fg hover:text-fg',
      )}
    >
      {children}
    </Link>
  );
}
