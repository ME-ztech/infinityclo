'use client';

/**
 * Slide-out mini cart.
 *
 * A modal dialog from the right edge: focus-trapped, closed by Escape, the
 * backdrop or the close button. Lines can be changed or removed in place, and
 * the checkout button starts the on-site checkout.
 */
import Link from 'next/link';

import { Button, ButtonLink } from '@/components/ui/Button';
import { useCart } from '@/lib/cart/CartProvider';
import { useFocusTrap } from '@/lib/useFocusTrap';

import { CartLineRow } from './CartLineRow';
import { CartRecommendations } from './CartRecommendations';
import { CartSummary } from './CartSummary';
import { CheckoutAction } from './CheckoutAction';

export function CartDrawer() {
  const { cart, isDrawerOpen, closeDrawer, isHydrated, isPending, lineCount } = useCart();
  const containerRef = useFocusTrap(isDrawerOpen, closeDrawer);

  if (!isDrawerOpen) return null;

  const isEmpty = cart.lines.length === 0 && !isPending;

  return (
    <div className="fixed inset-0 z-[90]" data-testid="cart-drawer">
      <button
        type="button"
        aria-label="Close cart"
        onClick={closeDrawer}
        className="absolute inset-0 h-full w-full animate-[fade-in_200ms_ease-out] cursor-default bg-black/40"
        tabIndex={-1}
      />

      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Your cart"
        tabIndex={-1}
        data-surface="paper"
        className="bg-surface text-fg absolute inset-y-0 right-0 flex w-full max-w-md animate-[slide-in-right_260ms_var(--ease-brand)] flex-col shadow-2xl"
      >
        <div className="border-line flex h-16 shrink-0 items-center justify-between border-b px-5">
          <h2 className="text-xs font-semibold tracking-[0.18em] uppercase">
            Your cart{isHydrated && lineCount > 0 ? ` (${lineCount})` : ''}
          </h2>
          <button
            type="button"
            onClick={closeDrawer}
            aria-label="Close cart"
            className="text-fg -mr-2.5 grid h-11 w-11 place-items-center"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path d="m4 4 12 12M16 4 4 16" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>

        {!isHydrated || (cart.lines.length === 0 && isPending) ? (
          <div className="flex-1 space-y-4 p-5" aria-hidden>
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={index} className="bg-surface-sunken h-28 animate-pulse" />
            ))}
          </div>
        ) : isEmpty ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8 text-center">
            <p className="font-display text-fg text-2xl">Your cart is empty</p>
            <ButtonLink href="/shop" onClick={closeDrawer} variant="primary" size="md">
              Shop all
            </ButtonLink>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto">
              <ul className="divide-line divide-y px-5">
                {cart.lines.map((line) => (
                  <CartLineRow key={line.id} line={line} />
                ))}
              </ul>
              <CartRecommendations variant="drawer" />
            </div>

            <div className="border-line shrink-0 border-t p-5">
              <CartSummary />

              <div className="mt-4 flex flex-col gap-3">
                <CheckoutAction cart={cart} disabled={isPending} />
                <Button variant="secondary" size="md" onClick={closeDrawer} fullWidth>
                  Continue shopping
                </Button>
                <Link
                  href="/cart"
                  onClick={closeDrawer}
                  className="text-fg-muted hover:text-fg flex min-h-11 items-center justify-center text-[0.7rem] tracking-[0.14em] uppercase underline underline-offset-4"
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
