import type { Metadata } from 'next';
import Link from 'next/link';

import { CarriedOverNotice, PolicyPage, PolicySection } from '@/components/content/PolicyPage';
import { INSTAGRAM_HANDLE, INSTAGRAM_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Shipping',
  description: 'INFNITY shipping policy: order processing and shipping times.',
  alternates: { canonical: '/shipping' },
};

/**
 * The store's shipping policy as published on infinityclo.ca. Nothing beyond
 * that policy — no carrier, rate or free-shipping threshold — is stated here,
 * because none has been verified.
 */
export default function ShippingPage() {
  return (
    <PolicyPage title="Shipping" note={<CarriedOverNotice />}>
      <PolicySection heading="Processing and shipping times">
        <p>Please give it 2–3 business days for your order to be processed.</p>
        <p>
          Once your order is processed, give it 3–5 business days to be shipped to your preferred
          destination.
        </p>
      </PolicySection>

      <PolicySection heading="Rates and taxes">
        <p>
          Shipping and taxes are calculated at checkout for your address, before you pay. Prices
          are in Canadian dollars (CAD).
        </p>
      </PolicySection>

      <PolicySection heading="Tracking your order">
        <p>
          Sign in to{' '}
          <Link href="/account/orders" className="text-fg underline underline-offset-4">
            your account
          </Link>{' '}
          to see your orders. Tracking details appear there once your order has shipped with a
          tracking number.
        </p>
      </PolicySection>

      <PolicySection heading="Questions">
        <p>
          Message us on Instagram{' '}
          <a
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-fg underline underline-offset-4"
          >
            {INSTAGRAM_HANDLE}
          </a>{' '}
          or use the{' '}
          <Link href="/contact" className="text-fg underline underline-offset-4">
            contact form
          </Link>
          .
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
