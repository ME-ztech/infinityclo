'use client';

/**
 * The checkout control.
 *
 * Checkout is Shopify-hosted. This button posts the cart's identities to
 * `/api/checkout`, which re-validates every line against the live catalogue and
 * returns the Shopify checkout URL; the browser is then sent there. No price and
 * no payment detail ever passes through this component.
 *
 * It refuses, with a reason, in three cases: checkout is switched off for this
 * deployment, the cart holds a sold-out line, or the server reports the cart
 * changed (409) — in which case the cart is re-priced so the customer can see
 * what happened.
 */
import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { checkoutAvailability } from '@/domain/checkout';
import type { Cart } from '@/domain/types';
import { track } from '@/lib/analytics';
import { useCart } from '@/lib/cart/CartProvider';
import { CHECKOUT_ENABLED } from '@/lib/site';

export function CheckoutAction({ cart, disabled }: { cart: Cart; disabled?: boolean }) {
  const { persisted, discountCode, refresh } = useCart();
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availability = checkoutAvailability(cart, CHECKOUT_ENABLED);

  if (availability.status === 'unavailable' && availability.reason === 'disabled') {
    return (
      <div data-testid="checkout-unavailable">
        <Button variant="primary" size="lg" fullWidth disabled aria-describedby="checkout-note">
          Checkout unavailable
        </Button>
        <p
          id="checkout-note"
          className="text-fg-muted mt-3 text-center text-[0.72rem] leading-relaxed"
        >
          Checkout is switched off on this preview, so no order can be placed and nothing will be
          charged.
        </p>
      </div>
    );
  }

  if (availability.status === 'unavailable' && availability.reason === 'items_unavailable') {
    return (
      <div data-testid="checkout-blocked">
        <Button variant="primary" size="lg" fullWidth disabled data-testid="checkout-button">
          Checkout
        </Button>
        <p role="alert" className="text-signal mt-3 text-center text-[0.72rem]">
          An item in your cart has sold out. Remove it to continue.
        </p>
      </div>
    );
  }

  async function startCheckout() {
    setError(null);
    setIsRedirecting(true);
    track({ name: 'checkout_started', lineCount: cart.lines.length, subtotal: cart.subtotal });

    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          cart: persisted,
          ...(discountCode.trim() && { discountCode: discountCode.trim() }),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { url?: string; error?: string };

      if (response.ok && data.url) {
        // A full navigation: checkout lives on Shopify's domain.
        window.location.assign(data.url);
        return;
      }

      setError(data.error ?? 'Checkout could not be started. Try again.');
      // 409 means the catalogue disagrees with this cart — show the customer why.
      if (response.status === 409) refresh();
    } catch {
      setError('Network error. Check your connection and try again.');
    }
    setIsRedirecting(false);
  }

  return (
    <div>
      <Button
        variant="primary"
        size="lg"
        fullWidth
        data-testid="checkout-button"
        disabled={disabled || isRedirecting || availability.status !== 'available'}
        onClick={() => void startCheckout()}
      >
        {isRedirecting ? 'Opening secure checkout…' : 'Checkout'}
      </Button>
      {error && (
        <p
          role="alert"
          data-testid="checkout-error"
          className="text-signal mt-3 text-center text-[0.72rem] leading-relaxed"
        >
          {error}
        </p>
      )}
    </div>
  );
}
