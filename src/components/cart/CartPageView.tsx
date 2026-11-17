'use client';

import { CartLineRow } from '@/components/cart/CartLineRow';
import { CartRecommendations } from '@/components/cart/CartRecommendations';
import { CartSummary } from '@/components/cart/CartSummary';
import { CheckoutAction } from '@/components/cart/CheckoutAction';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useCart } from '@/lib/cart/CartProvider';

export function CartPageView() {
  const { cart, isHydrated, isPending } = useCart();

  if (!isHydrated || (cart.lines.length === 0 && isPending)) {
    return (
      <div className="grid gap-10 lg:grid-cols-[1fr_360px]" aria-busy>
        <div className="flex flex-col gap-4">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="bg-surface-sunken h-32 animate-pulse" />
          ))}
        </div>
        <div className="bg-surface-sunken h-56 animate-pulse" />
      </div>
    );
  }

  if (cart.lines.length === 0) {
    return (
      <EmptyState
        title="Your cart is empty"
        body="Nothing here yet."
        action={
          <ButtonLink href="/shop" variant="primary" size="lg">
            Shop all
          </ButtonLink>
        }
      />
    );
  }

  return (
    <>
      <div className="grid gap-10 lg:grid-cols-[1fr_360px] lg:gap-16">
        <ul className="divide-line border-line divide-y border-y" data-testid="cart-lines">
          {cart.lines.map((line) => (
            <CartLineRow key={line.id} line={line} />
          ))}
        </ul>

        <aside aria-label="Order summary" className="lg:sticky lg:top-28 lg:self-start">
          <div className="border-line border p-6">
            <h2 className="mb-5 text-xs font-semibold tracking-[0.18em] uppercase">Summary</h2>
            <CartSummary />
            <div className="mt-5 flex flex-col gap-3">
              <CheckoutAction cart={cart} disabled={isPending} />
              <ButtonLink href="/shop" variant="secondary" size="md" fullWidth>
                Continue shopping
              </ButtonLink>
            </div>
            <p className="text-fg-faint mt-4 text-center text-[0.7rem] leading-relaxed">
              Secure checkout is handled by Shopify. Guest checkout is available.
            </p>
          </div>
        </aside>
      </div>

      <CartRecommendations variant="page" />
    </>
  );
}
