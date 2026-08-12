'use client';

import { CartLineRow } from '@/components/cart/CartLineRow';
import { CheckoutAction } from '@/components/cart/CheckoutAction';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatMoney } from '@/domain/money';
import { useCart } from '@/lib/cart/CartProvider';

export function CartPageView() {
  const { cart, isHydrated, isPending } = useCart();

  if (!isHydrated) {
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
    <div className="grid gap-10 lg:grid-cols-[1fr_360px] lg:gap-16">
      <ul className="divide-line border-line divide-y border-y">
        {cart.lines.map((line) => (
          <CartLineRow key={line.id} line={line} />
        ))}
      </ul>

      <aside aria-label="Order summary" className="lg:sticky lg:top-28 lg:self-start">
        <div className="border-line border p-6">
          <h2 className="text-xs font-semibold tracking-[0.18em] uppercase">Summary</h2>

          <div className="mt-6 flex items-baseline justify-between">
            <span className="text-fg-muted text-sm">Subtotal</span>
            <span className="font-display text-fg text-2xl tabular-nums">
              {formatMoney(cart.subtotal)}
            </span>
          </div>

          <p className="text-fg-faint mt-3 text-[0.7rem] leading-relaxed">
            Shipping and taxes are calculated at checkout.
          </p>

          <div className="mt-6 flex flex-col gap-3">
            <CheckoutAction cart={cart} disabled={isPending} />
            <ButtonLink href="/shop" variant="secondary" size="md" fullWidth>
              Continue shopping
            </ButtonLink>
          </div>
        </div>
      </aside>
    </div>
  );
}
