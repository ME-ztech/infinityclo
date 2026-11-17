'use client';

/**
 * Cart totals, shared by the slide-out cart and the cart page.
 *
 * Only the subtotal is a known figure. Shipping, tax and any discount are
 * decided by Shopify checkout, so they are described rather than estimated — the
 * one exception is a live automatic offer, whose saving is shown clearly labelled
 * as an estimate that checkout confirms.
 */
import { useId, useState } from 'react';

import { formatMoney } from '@/domain/money';
import { useCart } from '@/lib/cart/CartProvider';

export function CartSummary() {
  const { cart, offers, discountCode, setDiscountCode } = useCart();
  const codeId = useId();
  const [isCodeOpen, setIsCodeOpen] = useState(discountCode.length > 0);

  const applied = offers.filter((offer) => offer.applies && offer.savings.amount > 0);
  const nudges = offers.filter((offer) => !offer.applies && offer.unitsShort > 0);
  const savings = applied.reduce((total, offer) => total + offer.savings.amount, 0);

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold tracking-[0.16em] uppercase">Subtotal</span>
        <span data-testid="cart-subtotal" className="font-display text-fg text-2xl tabular-nums">
          {formatMoney(cart.subtotal)}
        </span>
      </div>

      {applied.length > 0 && (
        <div className="mt-3" data-testid="cart-offer-savings">
          {applied.map((offer) => (
            <div key={offer.id} className="text-fg flex items-baseline justify-between gap-4 text-sm">
              <span className="min-w-0">{offer.title}</span>
              <span className="shrink-0 tabular-nums">−{formatMoney(offer.savings)}</span>
            </div>
          ))}
          <p className="text-fg-faint mt-1.5 text-[0.7rem] leading-relaxed">
            Estimated savings of {formatMoney({ amount: savings, currency: cart.currency })} —
            confirmed at checkout.
          </p>
        </div>
      )}

      {nudges.map((offer) => (
        <p
          key={offer.id}
          data-testid="cart-offer-nudge"
          className="border-line text-fg mt-3 border px-3 py-2.5 text-xs leading-relaxed"
        >
          Add {offer.unitsShort} more eligible {offer.unitsShort === 1 ? 'item' : 'items'} for{' '}
          {offer.description}.
        </p>
      ))}

      <p className="text-fg-faint mt-3 text-[0.7rem] leading-relaxed" data-testid="cart-disclaimer">
        Shipping and taxes calculated at checkout. Prices in {cart.currency}.
      </p>

      <div className="mt-3">
        {isCodeOpen ? (
          <div>
            <label
              htmlFor={codeId}
              className="text-fg-faint mb-1.5 block text-[0.66rem] font-semibold tracking-[0.16em] uppercase"
            >
              Discount code
            </label>
            <input
              id={codeId}
              type="text"
              value={discountCode}
              onChange={(event) => setDiscountCode(event.target.value.toUpperCase().slice(0, 32))}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              data-testid="discount-code"
              className="border-field text-fg focus:border-fg h-11 w-full border bg-transparent px-3 text-sm tracking-[0.08em] outline-none"
            />
            <p className="text-fg-faint mt-1.5 text-[0.7rem] leading-relaxed">
              Codes are checked and applied at checkout. You can also enter one there.
            </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsCodeOpen(true)}
            data-testid="discount-code-toggle"
            className="text-fg-muted hover:text-fg flex min-h-11 items-center text-[0.7rem] tracking-[0.14em] uppercase underline underline-offset-4"
          >
            Have a discount code?
          </button>
        )}
      </div>
    </div>
  );
}
