'use client';

/**
 * Global header.
 *
 * Two behaviours worth knowing about:
 *
 * - It starts transparent over a hero and turns solid on scroll, but only on
 *   routes that actually have a full-bleed hero. Everywhere else it is solid
 *   from the first pixel, because transparent-over-content cannot guarantee
 *   contrast.
 * - It hides on scroll down and returns on scroll up, which keeps the campaign
 *   imagery unobstructed on a phone without costing the customer a tap to reach
 *   navigation. The threshold is generous enough that small scroll jitter never
 *   flickers it.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { SearchOverlay } from '@/components/search/SearchOverlay';
import { Wordmark } from '@/components/ui/Wordmark';
import { useCart } from '@/lib/cart/CartProvider';
import { cn } from '@/lib/cn';
import { PRIMARY_NAV } from '@/lib/site';

import { MobileNav } from './MobileNav';

/** Routes whose hero sits under a transparent header. */
const TRANSPARENT_ROUTES = new Set(['/', '/vault', '/troop', '/about']);

const HIDE_AFTER = 120;

export function Header() {
  const pathname = usePathname();
  const { lineCount, isHydrated, openDrawer } = useCart();

  const [isScrolled, setIsScrolled] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const lastScrollY = useRef(0);

  const allowsTransparent = TRANSPARENT_ROUTES.has(pathname);

  useEffect(() => {
    function onScroll() {
      const y = window.scrollY;
      setIsScrolled(y > 24);

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

  const isSolid = !allowsTransparent || isScrolled;

  return (
    <>
      <header
        data-testid="site-header"
        className={cn(
          'fixed inset-x-0 top-0 z-50 transition-[transform,background-color,border-color] duration-300 ease-[--ease-brand]',
          isSolid ? 'bg-void/95 border-ash/60 border-b backdrop-blur-sm' : 'border-b border-transparent',
          isHidden ? '-translate-y-full' : 'translate-y-0',
        )}
      >
        <div className="edge flex h-16 items-center justify-between gap-4 md:h-20">
          <div className="flex items-center gap-8">
            <button
              type="button"
              onClick={() => setIsMobileNavOpen(true)}
              aria-label="Open menu"
              aria-expanded={isMobileNavOpen}
              className="text-bone hover:text-paper -ml-2 p-2 lg:hidden"
            >
              <MenuIcon />
            </button>

            <Link href="/" aria-label="INFNITY — home" className="shrink-0">
              <Wordmark className="text-lg md:text-xl" />
            </Link>
          </div>

          <nav aria-label="Primary" className="hidden lg:block">
            <ul className="flex items-center gap-8">
              {PRIMARY_NAV.map((item) => {
                const isActive =
                  item.href === '/shop'
                    ? pathname === '/shop'
                    : pathname.startsWith(item.href.split('?')[0] ?? item.href) &&
                      item.href !== '/shop?sort=newest';
                return (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      className={cn(
                        'hover:text-paper relative py-2 text-[0.72rem] font-semibold tracking-[0.18em] uppercase transition-colors',
                        isActive ? 'text-paper' : 'text-bone/80',
                      )}
                    >
                      {item.label}
                      {isActive && (
                        <span className="bg-paper absolute inset-x-0 -bottom-0.5 h-px" aria-hidden />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="flex items-center gap-1 md:gap-2">
            <button
              type="button"
              onClick={() => setIsSearchOpen(true)}
              aria-label="Search"
              className="text-bone hover:text-paper p-2"
            >
              <SearchIcon />
            </button>

            <Link
              href="/account"
              aria-label="Account"
              className="text-bone hover:text-paper hidden p-2 sm:block"
            >
              <AccountIcon />
            </Link>

            <button
              type="button"
              onClick={openDrawer}
              aria-label={
                isHydrated && lineCount > 0 ? `Cart, ${lineCount} items` : 'Cart'
              }
              data-testid="cart-button"
              className="text-bone hover:text-paper relative p-2"
            >
              <CartIcon />
              {/* Rendered only after hydration so the server and first client
                  paint agree; a 0 badge would flash on every cold load. */}
              {isHydrated && lineCount > 0 && (
                <span
                  data-testid="cart-count"
                  className="bg-paper text-void absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[0.6rem] font-bold tabular-nums"
                >
                  {lineCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <MobileNav isOpen={isMobileNavOpen} onClose={() => setIsMobileNavOpen(false)} />
      <SearchOverlay isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
    </>
  );
}

/* Inline icons keep the header dependency-free and avoid an icon-font payload. */

function MenuIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden focusable="false">
      <path d="M2 6h18M2 11h18M2 16h18" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden focusable="false">
      <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="m13.5 13.5 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function AccountIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden focusable="false">
      <circle cx="10" cy="7" r="3.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3.5 17a6.5 6.5 0 0 1 13 0" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden focusable="false">
      <path
        d="M4 6h12l-1 11H5L4 6Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M7.5 8V5a2.5 2.5 0 0 1 5 0v3" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
