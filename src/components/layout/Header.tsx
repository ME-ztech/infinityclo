'use client';

/**
 * Global header.
 *
 * Three columns: navigation on the left, the brand mark dead centre, utilities
 * on the right. The bar is always solid white with ink type — it sits above the
 * campaign hero rather than over it, so there is no scroll position at which
 * the navigation loses contrast against a photograph.
 *
 * It is `sticky`, so it occupies its own space (no page guesses its height) and
 * stays reachable all the way down the page.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { PreviewNotice } from '@/components/layout/PreviewNotice';
import { SearchOverlay } from '@/components/search/SearchOverlay';
import { Wordmark } from '@/components/ui/Wordmark';
import { useCart } from '@/lib/cart/CartProvider';
import { cn } from '@/lib/cn';
import { PRIMARY_NAV } from '@/lib/site';

import { MobileNav } from './MobileNav';

export interface Announcement {
  readonly text: string;
  readonly href: string;
}

export function Header({ announcement }: { announcement?: Announcement | null }) {
  const pathname = usePathname();
  const { lineCount, isHydrated, openDrawer } = useCart();

  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <>
      <div data-surface="paper" className="sticky top-0 z-50">
        <PreviewNotice />

        {announcement?.text && (
          <div
            data-surface="ink"
            data-testid="announcement-bar"
            className="bg-surface text-fg px-4 py-2 text-center text-[0.68rem] leading-snug font-semibold tracking-[0.16em] uppercase"
          >
            {announcement.href ? (
              <Link href={announcement.href} className="underline-offset-4 hover:underline">
                {announcement.text}
              </Link>
            ) : (
              announcement.text
            )}
          </div>
        )}

        <header
          data-testid="site-header"
          className={cn(
            'bg-surface/95 text-fg border-b backdrop-blur-md transition-[border-color] duration-300',
            isScrolled ? 'border-line' : 'border-hairline',
          )}
        >
          <div className="edge grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-3 md:h-[4.5rem]">
            {/* Left: menu on small screens, navigation on large. */}
            <div className="flex items-center">
              <button
                type="button"
                onClick={() => setIsMobileNavOpen(true)}
                aria-label="Open menu"
                aria-expanded={isMobileNavOpen}
                aria-controls="mobile-nav"
                data-testid="menu-button"
                className="text-fg -ml-2.5 grid h-11 w-11 place-items-center lg:hidden"
              >
                <MenuIcon />
              </button>

              <nav aria-label="Primary" className="hidden lg:block">
                <ul className="flex items-center gap-7">
                  {PRIMARY_NAV.map((item) => (
                    <li key={item.label}>
                      <Link
                        href={item.href}
                        aria-current={isActive(item.href) ? 'page' : undefined}
                        className={cn(
                          'group relative py-2 text-[0.7rem] font-semibold tracking-[0.2em] whitespace-nowrap uppercase transition-colors',
                          isActive(item.href) ? 'text-fg' : 'text-fg-muted hover:text-fg',
                        )}
                      >
                        {item.label}
                        <span
                          aria-hidden
                          className={cn(
                            'bg-fg absolute inset-x-0 -bottom-0.5 h-px origin-left transition-transform duration-300 ease-(--ease-brand)',
                            isActive(item.href)
                              ? 'scale-x-100'
                              : 'scale-x-0 group-hover:scale-x-100',
                          )}
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>

            {/* Centre: the brand. */}
            <Link
              href="/"
              aria-label="INFNITY — home"
              data-testid="brand-home"
              className="flex min-h-11 items-center justify-self-center"
            >
              <Wordmark
                withEmblem
                emblemClassName="h-7 md:h-9"
                className="text-[1.05rem] md:text-[1.35rem]"
              />
            </Link>

            {/* Right: utilities. */}
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => setIsSearchOpen(true)}
                aria-label="Search"
                data-testid="search-button"
                className="text-fg grid h-11 w-11 place-items-center transition-opacity hover:opacity-60"
              >
                <SearchIcon />
              </button>

              <Link
                href="/account"
                aria-label="Account"
                data-testid="account-link"
                className="text-fg hidden h-11 w-11 place-items-center transition-opacity hover:opacity-60 sm:grid"
              >
                <AccountIcon />
              </Link>

              <button
                type="button"
                onClick={openDrawer}
                aria-label={isHydrated && lineCount > 0 ? `Cart, ${lineCount} items` : 'Cart'}
                data-testid="cart-button"
                className="text-fg relative -mr-2.5 flex h-11 items-center gap-1.5 px-2.5 transition-opacity hover:opacity-60"
              >
                <CartIcon />
                <span className="hidden text-[0.7rem] font-semibold tracking-[0.2em] uppercase lg:inline">
                  Cart
                </span>
                {/* Rendered only after hydration so the server and first client
                    paint agree; a 0 badge would flash on every cold load. */}
                {isHydrated && lineCount > 0 && (
                  <span
                    data-testid="cart-count"
                    className="bg-inverse-surface text-inverse-fg flex h-[1.15rem] min-w-[1.15rem] items-center justify-center rounded-full px-1 text-[0.6rem] font-bold tabular-nums"
                  >
                    {lineCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </header>
      </div>

      <MobileNav isOpen={isMobileNavOpen} onClose={() => setIsMobileNavOpen(false)} />
      {isSearchOpen && <SearchOverlay onClose={() => setIsSearchOpen(false)} />}
    </>
  );
}

/* Inline icons keep the header dependency-free and avoid an icon-font payload. */

function MenuIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden focusable="false">
      <path d="M2 6h18M2 11h18M2 16h18" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 20 20" fill="none" aria-hidden focusable="false">
      <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.6" />
      <path d="m13.5 13.5 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function AccountIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 20 20" fill="none" aria-hidden focusable="false">
      <circle cx="10" cy="7" r="3.25" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3.5 17a6.5 6.5 0 0 1 13 0" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 20 20" fill="none" aria-hidden focusable="false">
      <path
        d="M4 6h12l-1 11H5L4 6Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M7.5 8V5a2.5 2.5 0 0 1 5 0v3" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
