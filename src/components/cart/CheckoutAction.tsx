'use client';

/**
 * The checkout control.
 *
 * When no payment provider is connected this renders a disabled button and says
 * why. It deliberately does not navigate anywhere, show a spinner, or produce a
 * confirmation — a customer must never be able to come away believing an order
 * was placed. See src/domain/checkout.ts.
 */
import { checkoutAvailability } from '@/domain/checkout';
import type { Cart } from '@/domain/types';
import { track } from '@/lib/analytics';
import { Button } from '@/components/ui/Button';
import { CHECKOUT_ENABLED } from '@/lib/site';

export function CheckoutAction({ cart, disabled }: { cart: Cart; disabled?: boolean }) {
  const availability = checkoutAvailability(cart, CHECKOUT_ENABLED);

  if (availability.status === 'unavailable' && availability.reason === 'not_implemented') {
    return (
      <div data-testid="checkout-unavailable">
        <Button variant="primary" size="lg" fullWidth disabled aria-describedby="checkout-note">
          Checkout unavailable
        </Button>
        <p
          id="checkout-note"
          className="text-smoke mt-3 text-center text-[0.72rem] leading-relaxed"
        >
          This is a preview build. Payments are not connected, so no order can be placed and nothing
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
        <p className="text-signal mt-3 text-center text-[0.72rem]">
          Remove the sold-out items above to continue.
        </p>
      </div>
    );
  }

  return (
    <Button
      variant="primary"
      size="lg"
      fullWidth
      disabled={disabled || availability.status !== 'available'}
      onClick={() =>
        track({
          name: 'checkout_started',
          lineCount: cart.lines.length,
          subtotal: cart.subtotal,
        })
      }
    >
      Checkout
    </Button>
  );
}
