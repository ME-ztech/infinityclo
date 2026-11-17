'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface NavItem {
  readonly href: string;
  readonly label: string;
}

/** Section navigation. The list is already filtered by role on the server. */
export function AdminNav({ items }: { items: readonly NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Back office sections" className="border-b border-neutral-200 bg-white">
      <ul className="mx-auto flex max-w-[92rem] gap-1 overflow-x-auto px-3 sm:px-5">
        {items.map((item) => {
          const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                data-testid={`nav-${item.label.toLowerCase().replace(/[^a-z]+/g, '-')}`}
                className={`block border-b-2 px-3 py-3 text-xs font-bold tracking-[0.1em] uppercase focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-neutral-950 ${
                  active
                    ? 'border-neutral-950 text-neutral-950'
                    : 'border-transparent text-neutral-600 hover:text-neutral-950'
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
