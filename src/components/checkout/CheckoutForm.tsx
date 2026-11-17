'use client';

/**
 * Checkout.
 *
 * Every number on this page comes from the server. The form sends contact
 * details, an address, a shipping choice and an optional code; the server
 * re-prices the checkout and sends back the totals shown in the summary. The
 * payment is then raised for that server-side total.
 *
 * Card details are entered into Stripe's Payment Element, which is an iframe
 * served by Stripe: they never pass through this page or this server.
 */
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { FIELD, LABEL } from '@/components/account/AccountShell';
import { Button } from '@/components/ui/Button';
import type { CheckoutView } from '@/server/commerce/service';

const PROVINCES: ReadonlyArray<[string, string]> = [
  ['AB', 'Alberta'],
  ['BC', 'British Columbia'],
  ['MB', 'Manitoba'],
  ['NB', 'New Brunswick'],
  ['NL', 'Newfoundland and Labrador'],
  ['NS', 'Nova Scotia'],
  ['NT', 'Northwest Territories'],
  ['NU', 'Nunavut'],
  ['ON', 'Ontario'],
  ['PE', 'Prince Edward Island'],
  ['QC', 'Quebec'],
  ['SK', 'Saskatchewan'],
  ['YT', 'Yukon'],
];

const money = (cents: number, currency: string): string =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency }).format(cents / 100);

interface StripeLike {
  elements(options: { clientSecret: string; appearance?: unknown }): {
    create(type: 'payment'): { mount(target: HTMLElement): void };
  };
  confirmPayment(options: {
    elements: unknown;
    confirmParams: { return_url: string };
  }): Promise<{ error?: { message?: string } }>;
}

declare global {
  interface Window {
    Stripe?: (key: string) => StripeLike;
  }
}

function loadStripeJs(): Promise<void> {
  if (window.Stripe) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://js.stripe.com/v3';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load the payment form.'));
    document.head.appendChild(script);
  });
}

interface Props {
  initial: CheckoutView;
  /** Countries the store ships to; `*` means anywhere. */
  countries: readonly string[];
}

type Payment =
  | { provider: 'stripe'; stripe: StripeLike; elements: unknown }
  | { provider: 'test' }
  | null;

export function CheckoutForm({ initial, countries }: Props) {
  const [checkout, setCheckout] = useState(initial);
  const [email, setEmail] = useState(initial.email ?? '');
  const [consent, setConsent] = useState(initial.recoveryConsent);
  const [address, setAddress] = useState({
    firstName: initial.shippingAddress?.firstName ?? '',
    lastName: initial.shippingAddress?.lastName ?? '',
    line1: initial.shippingAddress?.line1 ?? '',
    line2: initial.shippingAddress?.line2 ?? '',
    city: initial.shippingAddress?.city ?? '',
    province: initial.shippingAddress?.province ?? '',
    postalCode: initial.shippingAddress?.postalCode ?? '',
    country: initial.shippingAddress?.country ?? (countries.includes('CA') || countries.includes('*') ? 'CA' : (countries[0] ?? 'CA')),
    phone: initial.shippingAddress?.phone ?? '',
  });
  const [code, setCode] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const [discountMessage, setDiscountMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [payment, setPayment] = useState<Payment>(null);
  const paymentMount = useRef<HTMLDivElement | null>(null);

  const anywhere = countries.includes('*');
  const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
  const detailsSaved = checkout.shippingAddress !== null && checkout.email !== null;

  const patch = useCallback(async (body: Record<string, unknown>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/checkout/session', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as {
        checkout?: CheckoutView;
        problems?: string[];
        discountMessage?: string | null;
        error?: string;
      };
      if (!response.ok || !data.checkout) {
        setError(data.error ?? 'Could not update your checkout.');
        return false;
      }
      setCheckout(data.checkout);
      setProblems(data.problems ?? []);
      setDiscountMessage(data.discountMessage ?? null);
      return (data.problems ?? []).length === 0;
    } catch {
      setError('Network error. Check your connection and try again.');
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  async function saveDetails(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Read what is actually in the fields, not only React's copy of it. Browser
    // autofill, and anything typed before this component finished loading, can
    // fill an input without firing the change events state depends on.
    const data = new FormData(event.currentTarget);
    const value = (name: string): string => String(data.get(name) ?? '').trim();
    const submitted = {
      firstName: value('firstName'),
      lastName: value('lastName'),
      line1: value('line1'),
      line2: value('line2'),
      city: value('city'),
      province: value('province'),
      postalCode: value('postalCode'),
      country: value('country').toUpperCase(),
      phone: value('phone'),
    };
    setEmail(value('email'));
    setAddress(submitted);
    // Any change to the details invalidates a payment form already on screen.
    setPayment(null);
    await patch({ email: value('email'), recoveryConsent: data.get('recoveryConsent') === 'on', shippingAddress: submitted });
  }

  async function startPayment() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/checkout/payment', { method: 'POST' });
      const data = (await response.json()) as {
        provider?: 'stripe' | 'test';
        clientSecret?: string;
        publishableKey?: string | null;
        error?: string;
      };
      if (!response.ok || !data.provider || !data.clientSecret) {
        setError(data.error ?? 'Payment could not be started.');
        return;
      }
      if (data.provider === 'test') {
        setPayment({ provider: 'test' });
        return;
      }
      if (!data.publishableKey) {
        setError('Payment is not available right now.');
        return;
      }
      await loadStripeJs();
      const stripe = window.Stripe!(data.publishableKey);
      const elements = stripe.elements({ clientSecret: data.clientSecret, appearance: { theme: 'flat' } });
      setPayment({ provider: 'stripe', stripe, elements });
      // Mount after React has rendered the container.
      requestAnimationFrame(() => {
        if (paymentMount.current) elements.create('payment').mount(paymentMount.current);
      });
    } catch (caught) {
      setError((caught as Error).message || 'Payment could not be started.');
    } finally {
      setBusy(false);
    }
  }

  async function pay() {
    if (!payment) return;
    setBusy(true);
    setError(null);
    if (payment.provider === 'test') {
      const response = await fetch('/api/checkout/test-pay', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      if (response.ok) {
        window.location.assign('/checkout/complete');
        return;
      }
      setError('The test payment did not complete.');
      setBusy(false);
      return;
    }
    const result = await payment.stripe.confirmPayment({
      elements: payment.elements,
      confirmParams: { return_url: `${window.location.origin}/checkout/complete` },
    });
    // On success the browser is redirected; reaching here means it failed.
    setError(result.error?.message ?? 'Your payment was not completed.');
    setBusy(false);
  }

  // Hand the stock back if the customer deliberately returns to the cart.
  async function backToCart() {
    await fetch('/api/checkout/session', { method: 'DELETE' }).catch(() => undefined);
    window.location.assign('/cart');
  }

  useEffect(() => {
    if (checkout.status !== 'open') window.location.assign('/cart');
  }, [checkout.status]);

  const field = (name: keyof typeof address, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label htmlFor={`co-${name}`} className={LABEL}>
        {label}
      </label>
      <input
        id={`co-${name}`}
        name={name}
        className={FIELD}
        value={address[name]}
        onChange={(event) => setAddress((current) => ({ ...current, [name]: event.target.value }))}
        {...props}
      />
    </div>
  );

  return (
    <div className="grid gap-12 lg:grid-cols-[1fr_400px] lg:gap-16">
      <div className="min-w-0">
        <form onSubmit={saveDetails} data-testid="checkout-details" noValidate>
          <h2 className="font-display text-fg mb-5 text-2xl">Contact</h2>
          <label htmlFor="co-email" className={LABEL}>
            Email
          </label>
          <input
            id="co-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className={FIELD}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <label className="text-fg-muted mt-4 flex items-start gap-3 text-sm leading-snug">
            <input
              type="checkbox"
              name="recoveryConsent"
              className="mt-1 h-4 w-4"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />
            <span>Email me a reminder if I don’t finish checking out. Optional.</span>
          </label>

          <h2 className="font-display text-fg mt-12 mb-5 text-2xl">Shipping address</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {field('firstName', 'First name', { autoComplete: 'given-name', required: true })}
            {field('lastName', 'Last name', { autoComplete: 'family-name', required: true })}
            <div className="sm:col-span-2">{field('line1', 'Address', { autoComplete: 'address-line1', required: true })}</div>
            <div className="sm:col-span-2">
              {field('line2', 'Apartment, suite (optional)', { autoComplete: 'address-line2' })}
            </div>
            {field('city', 'City', { autoComplete: 'address-level2', required: true })}
            <div>
              <label htmlFor="co-country" className={LABEL}>
                Country
              </label>
              {anywhere ? (
                <input
                  id="co-country"
                  name="country"
                  className={FIELD}
                  maxLength={2}
                  placeholder="CA"
                  autoComplete="country"
                  aria-describedby="co-country-hint"
                  value={address.country}
                  onChange={(event) => setAddress((current) => ({ ...current, country: event.target.value.toUpperCase() }))}
                />
              ) : (
                <select
                  id="co-country"
                  name="country"
                  className={FIELD}
                  autoComplete="country"
                  value={address.country}
                  onChange={(event) => setAddress((current) => ({ ...current, country: event.target.value, province: '' }))}
                >
                  {countries.map((country) => (
                    <option key={country} value={country}>
                      {regionNames.of(country) ?? country}
                    </option>
                  ))}
                </select>
              )}
              {anywhere && (
                <p id="co-country-hint" className="text-fg-muted mt-1 text-xs">
                  Two-letter country code, for example CA or US.
                </p>
              )}
            </div>
            <div>
              <label htmlFor="co-province" className={LABEL}>
                {address.country === 'CA' ? 'Province' : 'State / region'}
              </label>
              {address.country === 'CA' ? (
                <select
                  id="co-province"
                  name="province"
                  className={FIELD}
                  autoComplete="address-level1"
                  value={address.province}
                  onChange={(event) => setAddress((current) => ({ ...current, province: event.target.value }))}
                >
                  <option value="">Select…</option>
                  {PROVINCES.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="co-province"
                  name="province"
                  className={FIELD}
                  autoComplete="address-level1"
                  value={address.province}
                  onChange={(event) => setAddress((current) => ({ ...current, province: event.target.value }))}
                />
              )}
            </div>
            {field('postalCode', address.country === 'CA' ? 'Postal code' : 'Postal / ZIP code', {
              autoComplete: 'postal-code',
              required: true,
            })}
            <div className="sm:col-span-2">{field('phone', 'Phone (optional)', { type: 'tel', autoComplete: 'tel' })}</div>
          </div>

          {problems.length > 0 && (
            <ul role="alert" className="text-signal mt-5 list-disc space-y-1 pl-5 text-sm" data-testid="checkout-problems">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}

          <div className="mt-8">
            <Button type="submit" variant={detailsSaved ? 'secondary' : 'primary'} size="lg" disabled={busy} data-testid="checkout-save-details">
              {detailsSaved ? 'Update details' : 'Continue to shipping'}
            </Button>
          </div>
        </form>

        {detailsSaved && (
          <section className="mt-12" aria-labelledby="co-shipping-heading">
            <h2 id="co-shipping-heading" className="font-display text-fg mb-5 text-2xl">
              Shipping method
            </h2>
            {checkout.shippingOptions.length === 0 ? (
              <p role="alert" className="text-signal text-sm">
                We do not currently ship to that address.
              </p>
            ) : (
              <fieldset className="border-line divide-line divide-y border" data-testid="checkout-shipping">
                <legend className="sr-only">Shipping method</legend>
                {checkout.shippingOptions.map((option) => {
                  const free =
                    option.freeOverCents !== null && checkout.subtotalCents - checkout.discountCents >= option.freeOverCents;
                  return (
                    <label key={option.id} className="flex cursor-pointer items-center gap-4 p-4">
                      <input
                        type="radio"
                        name="shipping"
                        className="h-4 w-4"
                        checked={checkout.shippingRateId === option.id}
                        disabled={busy}
                        onChange={() => {
                          setPayment(null);
                          void patch({ shippingRateId: option.id });
                        }}
                      />
                      <span className="flex-1">
                        <span className="text-fg block text-sm font-semibold">{option.name}</span>
                        {option.deliveryEstimate && (
                          <span className="text-fg-muted block text-xs">{option.deliveryEstimate}</span>
                        )}
                      </span>
                      <span className="text-fg text-sm font-semibold">
                        {free ? 'Free' : money(option.priceCents, checkout.currency)}
                      </span>
                    </label>
                  );
                })}
              </fieldset>
            )}
          </section>
        )}

        {detailsSaved && checkout.shippingRateId && (
          <section className="mt-12" aria-labelledby="co-payment-heading">
            <h2 id="co-payment-heading" className="font-display text-fg mb-5 text-2xl">
              Payment
            </h2>
            {!payment && (
              <Button variant="primary" size="lg" fullWidth disabled={busy} onClick={() => void startPayment()} data-testid="checkout-start-payment">
                Continue to payment
              </Button>
            )}
            {payment?.provider === 'stripe' && <div ref={paymentMount} className="mb-6 min-h-24" />}
            {payment?.provider === 'test' && (
              <p className="border-line text-fg-muted mb-6 border p-4 text-sm" data-testid="checkout-test-mode">
                <strong className="text-fg">Test mode.</strong> No payment provider is connected on this build, so no card is
                charged. Completing this creates a test order.
              </p>
            )}
            {payment && (
              <Button variant="primary" size="lg" fullWidth disabled={busy} onClick={() => void pay()} data-testid="checkout-pay">
                {busy ? 'Processing…' : `Pay ${money(checkout.totalCents, checkout.currency)}`}
              </Button>
            )}
          </section>
        )}

        {error && (
          <p role="alert" className="text-signal mt-6 text-sm" data-testid="checkout-error">
            {error}
          </p>
        )}

        <p className="mt-10 text-sm">
          <button type="button" onClick={() => void backToCart()} className="text-fg-muted hover:text-fg underline underline-offset-4">
            ← Return to cart
          </button>
        </p>
      </div>

      <aside className="bg-surface-sunken h-fit p-6 lg:sticky lg:top-28" aria-label="Order summary" data-testid="checkout-summary">
        <h2 className="font-display text-fg mb-5 text-xl">Order summary</h2>
        <ul className="divide-line divide-y">
          {checkout.lines.map((line, index) => (
            <li key={index} className="flex gap-4 py-4">
              {line.imageUrl && (
                <Image src={line.imageUrl} alt="" width={64} height={80} className="h-20 w-16 flex-none object-cover" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-fg text-sm font-semibold">{line.title}</p>
                <p className="text-fg-muted text-xs">
                  {line.variantTitle} · Qty {line.quantity}
                </p>
              </div>
              <p className="text-fg text-sm">{money(line.unitPriceCents * line.quantity, checkout.currency)}</p>
            </li>
          ))}
        </ul>

        <form
          className="mt-4 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setPayment(null);
            void patch({ discountCode: code });
          }}
        >
          <label htmlFor="co-code" className="sr-only">
            Discount code
          </label>
          <input
            id="co-code"
            className={FIELD}
            placeholder="Discount code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            autoCapitalize="characters"
          />
          <Button type="submit" variant="secondary" size="md" disabled={busy || !code.trim()} data-testid="checkout-apply-code">
            Apply
          </Button>
        </form>
        {discountMessage && (
          <p role="alert" className="text-signal mt-2 text-xs" data-testid="checkout-code-message">
            {discountMessage}
          </p>
        )}

        <dl className="mt-6 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-fg-muted">Subtotal</dt>
            <dd data-testid="checkout-subtotal">{money(checkout.subtotalCents, checkout.currency)}</dd>
          </div>
          {checkout.discountCents > 0 && (
            <div className="flex justify-between">
              <dt className="text-fg-muted">
                Discount{checkout.discountCode ? ` (${checkout.discountCode})` : checkout.discountTitle ? ` (${checkout.discountTitle})` : ''}
              </dt>
              <dd data-testid="checkout-discount">−{money(checkout.discountCents, checkout.currency)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-fg-muted">Shipping</dt>
            <dd data-testid="checkout-shipping-total">
              {checkout.shippingRateId ? money(checkout.shippingCents, checkout.currency) : 'Enter your address'}
            </dd>
          </div>
          {checkout.taxLines.map((tax) => (
            <div key={tax.name} className="flex justify-between">
              <dt className="text-fg-muted">
                {tax.name} ({(tax.rateBps / 100).toFixed(tax.rateBps % 100 ? 2 : 0)}%)
              </dt>
              <dd>{money(tax.amountCents, checkout.currency)}</dd>
            </div>
          ))}
          <div className="border-line text-fg flex justify-between border-t pt-3 text-base font-semibold">
            <dt>Total</dt>
            <dd data-testid="checkout-total">{money(checkout.totalCents, checkout.currency)}</dd>
          </div>
        </dl>
        <p className="text-fg-muted mt-4 text-xs leading-relaxed">
          Prices in {checkout.currency}. Your items are held for you while you check out. See our{' '}
          <Link href="/shipping" className="underline underline-offset-2">
            shipping
          </Link>{' '}
          and{' '}
          <Link href="/returns" className="underline underline-offset-2">
            returns
          </Link>{' '}
          policies.
        </p>
      </aside>
    </div>
  );
}
