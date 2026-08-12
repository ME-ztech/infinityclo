import type { Metadata } from 'next';

import { PendingNotice, PolicyPage, PolicySection } from '@/components/content/PolicyPage';

export const metadata: Metadata = {
  title: 'Returns',
  description: 'INFNITY returns and exchanges.',
  alternates: { canonical: '/returns' },
};

export default function ReturnsPage() {
  return (
    <PolicyPage title="Returns" intro="Returns and exchanges.">
      <PolicySection heading="Return window">
        <PendingNotice>
          The return window has not been confirmed. No number of days is stated here because stating
          one the brand has not agreed to would create an obligation it has not accepted.
        </PendingNotice>
      </PolicySection>

      <PolicySection heading="Condition">
        <PendingNotice>
          Conditions for accepting a return — unworn, tags attached, original packaging — are
          pending confirmation.
        </PendingNotice>
      </PolicySection>

      <PolicySection heading="How to start a return">
        <PendingNotice>
          The returns process and return address are pending confirmation. Do not send anything back
          until this page is complete.
        </PendingNotice>
      </PolicySection>

      <PolicySection heading="Refunds">
        <PendingNotice>
          Refund timing and method are pending confirmation, and depend on the payment provider
          connected in a later phase.
        </PendingNotice>
      </PolicySection>

      <PolicySection heading="Questions">
        <p>
          For anything not covered here, use the{' '}
          <a href="/contact" className="text-paper underline underline-offset-4">
            contact page
          </a>
          .
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
