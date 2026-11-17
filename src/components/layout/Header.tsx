'use client';

/**
 * Global header (2.0).
 *
 * The owner's notes ask for a persistent top menu — Home · Shop · Contact ·
 * Cart — on a white theme, with the brand mark prominent. Composition: text
 * navigation on the left, the owner's swoosh mark and the INFNITY wordmark
 * centred, Search · Account · Cart (n) on the right — the same "CART (0)" the
 * live store prints. On a phone: menu, centred logo, cart.
 *
 * Always solid white with black type, so contrast holds over every section
 * (including the light studio photography in the hero). It hides on scroll down
 * and returns on scroll up, and never hides while a panel is open.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { PreviewNotice } from '@/components/layout/PreviewNotice';
import { SearchOverlay } from '@/components/search/SearchOverlay';
import { BrandLogo } from '@/components/ui/Wordmark';
import { useCart } from '@/lib/cart/CartProvider';
import { cn } from '@/lib/cn';
import { PRIMARY_NAV } from '@/lib/site';

import { MobileNav } from './MobileNav';

const HIDE_AFTER = 160;

export function Header() {
  const pathname = usePathname();
  const { lineCount, isHydrated, openDrawer } = useCart();

  const [isScrolled, setIsScrolled] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    function onScroll() {
      const y = window.scrollY;
      setIsScrolled(y > 16);
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

  const count = isHydrated ? lineCount : 0;
  const linkClass = (active: boolean) =>
    cn(
      'font-display relative py-2 text-[0.78rem] tracking-[0.02em] transition-colors',
      active ? 'text-fg' : 'text-fg-muted hover:text-fg',
    );

  return (
    <>
      <div
        data-surface="paper"
        className={cn(
          'sticky top-0 z-50 transition-transform duration-300 ease-(--ease-brand)',
          isHidden ? '-translate-y-full' : 'translate-y-0',
        )}
      >
        <PreviewNotice />
        <header
          data-testid="site-header"
          className={cn(
            'bg-surface/95 text-fg border-b backdrop-blur-md transition-[border-color] duration-300',
            isScrolled ? 'border-line' : 'border-transparent',
          )}
        >
          <div className="edge grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-3 md:h-[4.75rem]">
            {/* Left: menu button (mobile) / primary navigation (desktop) */}
            <div className="flex items-center">
              <button
                type="button"
                onClick={() => setIsMobileNavOpen(true)}
                aria-label="Open menu"
                aria-expanded={isMobileNavOpen}
                className="text-fg hover:text-signal -ml-2 flex h-11 w-11 items-center justify-center transition-colors lg:hidden"
              >
                <MenuIcon />
              </button>
              <nav aria-label="Primary" className="hidden lg:block">
                <ul className="flex items-center gap-6 xl:gap-8">
                  {PRIMARY_NAV.map((item) => {
                    const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
                    return (
                      <li key={item.label}>
                        <Link href={item.href} className={linkClass(isActive)} aria-current={isActive ? 'page' : undefined}>
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>
            </div>

            {/* Centre: the owner's mark and wordmark */}
            <Link href="/" aria-label="INFNITY — home" className="justify-self-center">
              <BrandLogo />
            </Link>

            {/* Right: search, account, cart */}
            <div className="flex items-center justify-end gap-1 md:gap-5">
              <button
                type="button"
                onClick={() => setIsSearchOpen(true)}
                aria-label="Search"
                className="text-fg hover:text-signal flex h-11 w-11 items-center justify-center transition-colors md:w-auto"
              >
                <SearchIcon />
                <span className="font-display ml-2 hidden text-[0.78rem] lg:inline">Search</span>
              </button>
              <Link
                href="/account"
                className={cn(linkClass(pathname.startsWith('/account')), 'hidden md:inline')}
              >
                Account
              </Link>
              <button
                type="button"
                onClick={openDrawer}
                aria-label={count > 0 ? `Cart, ${count} ${count === 1 ? 'item' : 'items'}` : 'Cart, empty'}
                data-testid="cart-button"
                className="text-fg hover:text-signal flex h-11 min-w-11 items-center justify-center transition-colors"
              >
                <span className="md:hidden" aria-hidden>
                  <CartIcon />
                </span>
                <span className="font-display hidden text-[0.78rem] md:inline" aria-hidden>
                  Cart (<span data-testid="cart-count-desktop">{count}</span>)
                </span>
                {count > 0 && (
                  <span className="md:hidden">
                    <Pip testId="cart-count">{count}</Pip>
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

/** The count badge. Red because a live count is exactly the kind of fact red is for. */
function Pip({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return (
    <span
      data-testid={testId}
      className="bg-signal text-paper -ml-1.5 -mt-4 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[0.58rem] font-bold tabular-nums"
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
