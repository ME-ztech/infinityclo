'use client';

/**
 * Global header.
 *
 * 1.0 ran a transparent-over-hero header that turned solid on scroll. With 1.1's
 * alternating rooms that is unworkable: the same bar now floats over bone, over
 * white and over void within one scroll, and no single text colour survives all
 * three. Worse, it was a class of contrast bug that only appears at specific
 * scroll positions — the kind nobody catches until a customer does.
 *
 * So the bar is always solid bone with ink type. That is also the legacy
 * storefront's own treatment — a white bar carrying INFNITY.CLO and CART (0) —
 * and it is brand DNA worth keeping rather than a compromise.
 *
 * It still hides on scroll down and returns on scroll up, which keeps the
 * campaign imagery unobstructed on a phone without costing a tap to reach
 * navigation. The threshold is generous enough that scroll jitter never flickers
 * it, and it never hides while a panel is open.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { PreviewNotice } from '@/components/layout/PreviewNotice';
import { SearchOverlay } from '@/components/search/SearchOverlay';
import { Wordmark } from '@/components/ui/Wordmark';
import { useCart } from '@/lib/cart/CartProvider';
import { cn } from '@/lib/cn';
import { PRIMARY_NAV } from '@/lib/site';
import { useWishlist } from '@/lib/wishlist/useWishlist';

import { MobileNav } from './MobileNav';

const HIDE_AFTER = 140;

export function Header() {
  const pathname = usePathname();
  const { lineCount, isHydrated, openDrawer } = useCart();
  const wishlist = useWishlist();

  const [isScrolled, setIsScrolled] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    function onScroll() {
      const y = window.scrollY;
      setIsScrolled(y > 16);

      // Never hide while a panel is open, or the customer loses the close button.
      if (isMobileNavOpen || isSearchOpen) {
        setIsHidden(false);
      } else if (y > HIDE_AFTER && y > lastScrollY.current + 8) {
        setIsHidden(true);
      } else if (y < lastScrollY.current - 8) {
        setIsHidden(false);
      }
      lastScrollY.current = y;
    }

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [isMobileNavOpen, isSearchOpen]);

  const savedCount = wishlist.isHydrated ? wishlist.slugs.length : 0;

  return (
    <>
      {/* One fixed stack for the whole top chrome. The preview notice lives
          inside it rather than in page flow, so the two can never overlap and
          steal each other's clicks, and they hide and return together. */}
      <div
        data-surface="bone"
        className={cn(
          // `sticky`, not `fixed`. A fixed bar is out of flow, so every page had
          // to guess its height in top padding — and the guess was wrong the
          // moment the preview notice wrapped to two lines on a 393px phone,
          // putting the breadcrumb underneath the header. Sticky occupies its
          // own space, so nothing can ever be hidden beneath it and no page
          // carries a magic number.
          'sticky top-0 z-50 transition-transform duration-300 ease-(--ease-brand)',
          isHidden ? '-translate-y-full' : 'translate-y-0',
        )}
      >
        <PreviewNotice />

        <header
          data-testid="site-header"
          className={cn(
            'bg-surface/95 text-fg border-b backdrop-blur-md transition-[border-color,box-shadow] duration-300',
            isScrolled ? 'border-line/80 shadow-[0_1px_0_rgba(0,0,0,0.04)]' : 'border-transparent',
          )}
        >
          <div className="edge flex h-16 items-center justify-between gap-4 md:h-[4.5rem]">
            <div className="flex items-center gap-8">
              <button
                type="button"
                onClick={() => setIsMobileNavOpen(true)}
                aria-label="Open menu"
                aria-expanded={isMobileNavOpen}
                className="text-fg hover:text-signal -ml-2 p-2 transition-colors lg:hidden"
              >
                <MenuIcon />
              </button>

              <Link href="/" aria-label="INFNITY — home" className="shrink-0">
                <Wordmark className="text-lg md:text-xl" />
              </Link>
            </div>

            <nav aria-label="Primary" className="hidden lg:block">
              <ul className="flex items-center gap-7">
                {PRIMARY_NAV.map((item) => {
                  const base = item.href.split('?')[0] ?? item.href;
                  const isActive =
                    item.href === '/shop?sort=newest'
                      ? false
                      : base === '/shop'
                        ? pathname === '/shop'
                        : pathname.startsWith(base);
                  return (
                    <li key={item.label}>
                      <Link
                        href={item.href}
                        className={cn(
                          'group relative py-2 text-[0.7rem] font-semibold tracking-[0.2em] uppercase transition-colors',
                          isActive ? 'text-fg' : 'text-fg-muted hover:text-fg',
                        )}
                      >
                        {item.label}
                        <span
                          aria-hidden
                          className={cn(
                            'bg-signal absolute inset-x-0 -bottom-0.5 h-px origin-left transition-transform duration-300 ease-(--ease-brand)',
                            isActive ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100',
                          )}
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <div className="flex items-center gap-0.5 md:gap-1">
              <button
                type="button"
                onClick={() => setIsSearchOpen(true)}
                aria-label="Search"
                className="text-fg hover:text-signal p-2.5 transition-colors"
              >
                <SearchIcon />
              </button>

              <Link
                href="/account/wishlist"
                aria-label={savedCount > 0 ? `Wishlist, ${savedCount} saved` : 'Wishlist'}
                className="text-fg hover:text-signal relative hidden p-2.5 transition-colors sm:block"
              >
                <HeartIcon />
                {/* Rendered only after hydration so the server and first client
                    paint agree; a 0 badge would flash on every cold load. */}
                {savedCount > 0 && <Pip>{savedCount}</Pip>}
              </Link>

              <Link
                href="/account"
                aria-label="Account"
                className="text-fg hover:text-signal hidden p-2.5 transition-colors sm:block"
              >
                <AccountIcon />
              </Link>

              <button
                type="button"
                onClick={openDrawer}
                aria-label={isHydrated && lineCount > 0 ? `Cart, ${lineCount} items` : 'Cart'}
                data-testid="cart-button"
                className="text-fg hover:text-signal relative p-2.5 transition-colors"
              >
                <CartIcon />
                {isHydrated && lineCount > 0 && <Pip testId="cart-count">{lineCount}</Pip>}
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

/** The count badge. Red because a live count is exactly the kind of fact red is for. */
function Pip({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return (
    <span
      data-testid={testId}
      className="bg-signal text-paper absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[0.58rem] font-bold tabular-nums"
    >
      {children}
    </span>
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

function HeartIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 20 20" fill="none" aria-hidden focusable="false">
      <path
        d="M10 16.5 3.7 10.4a3.7 3.7 0 1 1 5.2-5.2l1.1 1 1.1-1a3.7 3.7 0 1 1 5.2 5.2L10 16.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
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
