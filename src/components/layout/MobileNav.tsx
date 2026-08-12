'use client';

/**
 * Mobile navigation.
 *
 * Full-screen rather than a slide-in sheet: at 390px a partial panel wastes the
 * canvas and makes the type feel cramped. Links are set at display scale so the
 * menu reads as part of the brand rather than as a utility list, and every
 * target clears 48px.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

import { Wordmark } from '@/components/ui/Wordmark';
import { cn } from '@/lib/cn';
import { LEGAL_NAV, PRIMARY_NAV } from '@/lib/site';
import { useFocusTrap } from '@/lib/useFocusTrap';

interface MobileNavProps {
  isOpen: boolean;
  onClose: () => void;
}

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

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      data-testid="mobile-nav"
      tabIndex={-1}
      className="bg-void fixed inset-0 z-[70] flex animate-[fade-in_200ms_ease-out] flex-col lg:hidden"
    >
      <div className="edge flex h-16 shrink-0 items-center justify-between">
        <Wordmark className="text-lg" />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close menu"
          className="text-bone hover:text-paper -mr-2 p-3"
        >
          <CloseIcon />
        </button>
      </div>

      <nav aria-label="Primary mobile" className="edge flex-1 overflow-y-auto py-6">
        <ul className="flex flex-col">
          {PRIMARY_NAV.map((item, index) => {
            const isActive = pathname === item.href.split('?')[0];
            return (
              <li key={item.label} className="border-ash/40 border-b">
                <Link
                  href={item.href}
                  onClick={onClose}
                  className={cn(
                    'font-display flex items-center justify-between py-5 text-3xl leading-none transition-colors',
                    isActive ? 'text-paper' : 'text-bone hover:text-paper',
                  )}
                >
                  <span>{item.label}</span>
                  {/* Decorative index — hidden from assistive tech so the link's
                      accessible name stays "Shop", not "Shop 02". */}
                  <span aria-hidden className="text-dim text-xs tabular-nums">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Secondary links keep a 44px touch target even though the type is
            small — the label sets the size, the row sets the tap area. */}
        <div className="mt-8 flex flex-col">
          {[
            { label: 'Account', href: '/account' },
            { label: 'Contact', href: '/contact' },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={onClose}
              className="text-bone hover:text-paper flex min-h-11 items-center text-xs font-semibold tracking-[0.18em] uppercase"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </nav>

      <div className="edge border-ash/40 flex shrink-0 items-center gap-6 border-t py-5">
        {LEGAL_NAV.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            onClick={onClose}
            className="text-dim hover:text-bone flex min-h-11 items-center text-[0.68rem] tracking-[0.14em] uppercase"
          >
            {link.label}
          </Link>
        ))}
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
