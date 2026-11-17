'use client';

import Link from 'next/link';

import { Button, ButtonLink } from '@/components/ui/Button';
import { useCart } from '@/lib/cart/CartProvider';
import { useFocusTrap } from '@/lib/useFocusTrap';

import { CartLineRow } from './CartLineRow';
import { CartSummary } from './CartSummary';

export function CartDrawer() {
  const { cart, isDrawerOpen, closeDrawer, isHydrated, lineCount } = useCart();
  const containerRef = useFocusTrap(isDrawerOpen, closeDrawer);

  if (!isDrawerOpen) return null;

  const isEmpty = cart.lines.length === 0;

  return (
    <div className="fixed inset-0 z-[90]" data-testid="cart-drawer">
      <button
        type="button"
        aria-label="Close cart"
        onClick={closeDrawer}
        className="bg-surface/70 absolute inset-0 h-full w-full cursor-default backdrop-blur-[2px]"
        tabIndex={-1}
      />

      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Shopping cart"
        tabIndex={-1}
        className="bg-surface-raised border-line absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l shadow-2xl"
      >
        <div className="border-line flex h-16 shrink-0 items-center justify-between border-b px-5">
          <h2 className="text-xs font-semibold tracking-[0.18em] uppercase">
            Cart{isHydrated && !isEmpty ? ` (${lineCount})` : ''}
          </h2>
          <button
            type="button"
            onClick={closeDrawer}
            aria-label="Close cart"
            className="text-fg-muted hover:text-fg -mr-2 p-3"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path d="m4 4 12 12M16 4 4 16" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>

        {!isHydrated ? (
          <div className="flex-1 space-y-4 p-5" aria-hidden>
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={index} className="bg-surface-sunken h-28 animate-pulse" />
            ))}
          </div>
        ) : isEmpty ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8 text-center">
            <p className="font-display text-fg text-2xl">Your cart is empty</p>
            <p className="text-fg-muted text-sm">Nothing here yet. Go find something.</p>
            <ButtonLink href="/shop" onClick={closeDrawer} variant="primary" size="md">
              Shop all
            </ButtonLink>
          </div>
        ) : (
          <>
            <ul className="divide-line flex-1 divide-y overflow-y-auto px-5">
              {cart.lines.map((line) => (
                <CartLineRow key={line.id} line={line} />
              ))}
            </ul>

            <div className="border-line shrink-0 border-t p-5">
              <CartSummary cart={cart} onNavigate={closeDrawer} />

              <div className="mt-3 flex flex-col gap-3">
                <Button variant="secondary" size="md" onClick={closeDrawer} fullWidth>
                  Continue shopping
                </Button>
                <Link
                  href="/cart"
                  onClick={closeDrawer}
                  className="text-fg-muted hover:text-fg text-center text-[0.7rem] tracking-[0.14em] uppercase underline underline-offset-4"
                >
                  View full cart
                </Link>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
