'use client';

/**
 * The checkout control.
 *
 * Posts the cart's identities (never prices) to `/api/checkout`, which
 * re-prices and validates every line server-side and returns a Shopify-hosted
 * checkout URL. The button locks while the request is in flight so a double tap
 * cannot start two checkouts. When checkout is not connected the control says
 * so plainly — a customer must never believe an order was placed.
 */
import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { checkoutAvailability } from '@/domain/checkout';
import type { Cart } from '@/domain/types';
import { track } from '@/lib/analytics';
import { useCart } from '@/lib/cart/CartProvider';
import { useStoreConfig } from '@/lib/store-config';

export function CheckoutAction({ cart, disabled }: { cart: Cart; disabled?: boolean }) {
  const { checkoutMode } = useStoreConfig();
  const { persistedLines } = useCart();
  const [state, setState] = useState<
    { status: 'idle' | 'loading' } | { status: 'error'; message: string }
  >({
    status: 'idle',
  });
  const availability = checkoutAvailability(cart, checkoutMode);

  if (availability.status === 'unavailable' && availability.reason === 'not_connected') {
    return (
      <div data-testid="checkout-unavailable">
        <Button variant="primary" size="lg" fullWidth disabled aria-describedby="checkout-note">
          Checkout unavailable
        </Button>
        <p
          id="checkout-note"
          className="text-fg-muted mt-3 text-center text-[0.72rem] leading-relaxed"
        >
          This preview is not connected to Shopify checkout, so no order can be placed and nothing
          will be charged.
        </p>
      </div>
    );
  }

  if (availability.status === 'unavailable' && availability.reason === 'items_unavailable') {
    return (
      <div>
        <Button variant="primary" size="lg" fullWidth disabled>
          Checkout
        </Button>
        <p className="text-signal mt-3 text-center text-[0.72rem]" role="status">
          Remove the sold-out items above to continue.
        </p>
      </div>
    );
  }

  async function startCheckout() {
    if (state.status === 'loading') return;
    setState({ status: 'loading' });
    track({ name: 'checkout_started', lineCount: cart.lines.length, subtotal: cart.subtotal });
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lines: persistedLines }),
      });
      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url) {
        setState({
          status: 'error',
          message: data.error ?? 'Checkout could not start. Please try again.',
        });
        return;
      }
      window.location.assign(data.url);
    } catch {
      setState({
        status: 'error',
        message: 'Checkout could not start. Check your connection and try again.',
      });
    }
  }

  return (
    <div>
      <Button
        variant="primary"
        size="lg"
        fullWidth
        disabled={disabled || availability.status !== 'available' || state.status === 'loading'}
        aria-busy={state.status === 'loading'}
        onClick={() => void startCheckout()}
        data-testid="checkout-button"
      >
        {state.status === 'loading' ? 'Opening secure checkout…' : 'Checkout'}
      </Button>
      <p className="text-fg-faint mt-3 text-center text-[0.68rem] leading-relaxed">
        Secure checkout by Shopify. Shipping, taxes and discounts are calculated there.
      </p>
      {state.status === 'error' && (
        <p className="text-signal mt-2 text-center text-[0.72rem]" role="alert">
          {state.message}
        </p>
      )}
    </div>
  );
}
