import type { Metadata } from 'next';

import { PendingNotice, PolicyPage, PolicySection } from '@/components/content/PolicyPage';

export const metadata: Metadata = {
  title: 'Shipping',
  description: 'INFNITY shipping information.',
  alternates: { canonical: '/shipping' },
};

export default function ShippingPage() {
  return (
    <PolicyPage title="Shipping" intro="How orders are dispatched and delivered.">
      <PolicySection heading="Processing">
        <PendingNotice>
          Order processing times have not been confirmed. This section will state how long orders
          take to leave the warehouse once the brand confirms it.
        </PendingNotice>
      </PolicySection>

      <PolicySection heading="Destinations and carriers">
        <PendingNotice>
          Shipping destinations, carriers and service levels are not yet confirmed. No carrier or
          delivery estimate is stated here because none has been verified.
        </PendingNotice>
      </PolicySection>

      <PolicySection heading="Rates">
        <PendingNotice>
          Shipping rates and any free-shipping threshold are not yet confirmed. Shipping is
          calculated at checkout.
        </PendingNotice>
      </PolicySection>

      <PolicySection heading="Tracking">
        <PendingNotice>
          Tracking is issued once fulfilment is connected in a later phase.
        </PendingNotice>
      </PolicySection>

      <PolicySection heading="Questions">
        <p>
          For anything not covered here, use the{' '}
          <a href="/contact" className="text-fg underline underline-offset-4">
            contact page
          </a>
          .
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
