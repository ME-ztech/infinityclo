'use client';

/**
 * Order confirmation.
 *
 * Arriving here proves nothing — anyone can type the URL. The page asks the
 * server whether the checkout has become an order, and only says "confirmed"
 * once it has. The order itself is created by the payment provider's signed
 * webhook, which usually lands within a second or two of paying.
 */
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { ButtonLink } from '@/components/ui/Button';
import { useCart } from '@/lib/cart/CartProvider';

type State =
  | { phase: 'waiting' }
  | { phase: 'paid'; name: string; email: string; total: string }
  | { phase: 'slow' }
  | { phase: 'none' };

const MAX_ATTEMPTS = 20;

export function CheckoutComplete() {
  const { clear } = useCart();
  const [state, setState] = useState<State>({ phase: 'waiting' });

  useEffect(() => {
    let cancelled = false;
    let attempt = 0;

    async function poll() {
      attempt += 1;
      try {
        const response = await fetch('/api/checkout/status', { cache: 'no-store' });
        const data = (await response.json()) as {
          state: string;
          order?: { name: string; email: string; totalCents: number; currency: string };
        };
        if (cancelled) return;
        if (data.state === 'paid' && data.order) {
          clear();
          setState({
            phase: 'paid',
            name: data.order.name,
            email: data.order.email,
            total: new Intl.NumberFormat('en-CA', { style: 'currency', currency: data.order.currency }).format(
              data.order.totalCents / 100,
            ),
          });
          return;
        }
        if (data.state === 'none') {
          setState({ phase: 'none' });
          return;
        }
      } catch {
        // Transient network trouble: keep trying.
      }
      if (attempt >= MAX_ATTEMPTS) setState({ phase: 'slow' });
      else setTimeout(poll, 1500);
    }

    void poll();
    return () => {
      cancelled = true;
    };
  }, [clear]);

  if (state.phase === 'paid') {
    return (
      <div className="mx-auto max-w-xl text-center" data-testid="order-confirmed">
        <p className="text-fg-muted text-[0.72rem] font-semibold tracking-[0.2em] uppercase">Order confirmed</p>
        <h1 className="font-display text-headline text-fg mt-4" data-testid="order-number">
          {state.name}
        </h1>
        <p className="text-fg-muted mt-6 text-sm leading-relaxed">
          Thank you. We received your payment of {state.total}. A confirmation is on its way to {state.email}, and we will
          email you again when your order ships.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/shop" variant="primary" size="lg">
            Continue shopping
          </ButtonLink>
          <ButtonLink href="/account/orders" variant="secondary" size="lg">
            Track your order
          </ButtonLink>
        </div>
      </div>
    );
  }

  if (state.phase === 'none') {
    return (
      <div className="mx-auto max-w-xl text-center">
        <h1 className="font-display text-headline text-fg">No recent order</h1>
        <p className="text-fg-muted mt-6 text-sm">There is no checkout in progress on this device.</p>
        <div className="mt-10">
          <ButtonLink href="/shop" variant="primary" size="lg">
            Shop
          </ButtonLink>
        </div>
      </div>
    );
  }

  if (state.phase === 'slow') {
    return (
      <div className="mx-auto max-w-xl text-center" role="status">
        <h1 className="font-display text-headline text-fg">Still confirming your payment</h1>
        <p className="text-fg-muted mt-6 text-sm leading-relaxed">
          This is taking longer than usual. If your payment went through you will receive a confirmation email shortly —
          please do not pay again. If nothing arrives, <Link href="/contact" className="underline underline-offset-4">contact us</Link>.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl text-center" role="status" aria-live="polite">
      <h1 className="font-display text-headline text-fg">Confirming your payment…</h1>
      <p className="text-fg-muted mt-6 text-sm">This usually takes a few seconds. Please keep this page open.</p>
    </div>
  );
}
