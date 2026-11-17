'use client';

/**
 * Mobile navigation — a slide-out panel from the left edge.
 *
 * It is a modal dialog: focus is trapped inside it, Escape and the backdrop
 * close it, focus returns to the menu button, and it closes on navigation so it
 * can never cover the page that was just requested. Every target clears 44px.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

import { Wordmark } from '@/components/ui/Wordmark';
import { cn } from '@/lib/cn';
import { FOOTER_NAV, INSTAGRAM_HANDLE, INSTAGRAM_URL, PRIMARY_NAV } from '@/lib/site';
import { useFocusTrap } from '@/lib/useFocusTrap';

interface MobileNavProps {
  isOpen: boolean;
  onClose: () => void;
}

const SECONDARY = [
  { label: 'Account', href: '/account' },
  { label: 'Order tracking', href: '/account/orders' },
  { label: 'Size guide', href: '/size-guide' },
  { label: 'About', href: '/about' },
];

export function MobileNav({ isOpen, onClose }: MobileNavProps) {
  const pathname = usePathname();
  const containerRef = useFocusTrap(isOpen, onClose);

  // Close on navigation. Without this the panel survives a route change and
  // covers the page the customer just asked for.
  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (!isOpen) return null;

  const policies = FOOTER_NAV.find((group) => group.heading === 'Policies')?.links ?? [];

  return (
    <div className="fixed inset-0 z-[70] lg:hidden">
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        tabIndex={-1}
        className="absolute inset-0 h-full w-full animate-[fade-in_200ms_ease-out] cursor-default bg-black/40"
      />

      <div
        ref={containerRef}
        id="mobile-nav"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        data-testid="mobile-nav"
        tabIndex={-1}
        data-surface="paper"
        className="bg-surface text-fg absolute inset-y-0 left-0 flex w-[min(22rem,88vw)] animate-[slide-in-left_260ms_var(--ease-brand)] flex-col shadow-2xl"
      >
        <div className="border-line flex h-16 shrink-0 items-center justify-between border-b px-5">
          <Wordmark className="text-[1.35rem]" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="text-fg -mr-2.5 grid h-11 w-11 place-items-center"
          >
            <CloseIcon />
          </button>
        </div>

        <nav aria-label="Primary mobile" className="flex-1 overflow-y-auto px-5 py-4">
          <ul className="flex flex-col">
            {PRIMARY_NAV.map((item) => {
              const isActive =
                item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
              return (
                <li key={item.label} className="border-hairline border-b">
                  <Link
                    href={item.href}
                    onClick={onClose}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'font-display flex min-h-14 items-center justify-between py-3 text-[1.6rem] leading-none',
                      isActive ? 'text-fg' : 'text-fg-muted hover:text-fg',
                    )}
                  >
                    {item.label}
                    <span aria-hidden className="text-fg-faint text-base">
                      →
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>

          <ul className="mt-6 flex flex-col">
            {SECONDARY.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={onClose}
                  className="text-fg-muted hover:text-fg flex min-h-11 items-center text-xs font-semibold tracking-[0.2em] uppercase"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-line shrink-0 border-t px-5 py-4">
          <a
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-fg flex min-h-11 items-center text-xs font-semibold tracking-[0.16em]"
          >
            Instagram {INSTAGRAM_HANDLE}
          </a>
          <div className="flex flex-wrap gap-x-5">
            {policies.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={onClose}
                className="text-fg-faint hover:text-fg flex min-h-11 items-center text-[0.66rem] tracking-[0.18em] uppercase"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden focusable="false">
      <path d="m4 4 12 12M16 4 4 16" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
