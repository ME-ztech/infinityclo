import type { Metadata } from 'next';

import { PendingNotice, PolicyPage, PolicySection } from '@/components/content/PolicyPage';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How INFNITY handles personal information.',
  alternates: { canonical: '/privacy' },
};

/**
 * Describes what this build actually does with data — which is very little —
 * and marks everything that depends on the future backend or on legal review.
 * Nothing here asserts a compliance posture the brand has not established.
 */
export default function PrivacyPage() {
  return (
    <PolicyPage title="Privacy Policy" intro="What this site collects, and what it does not.">
      <PolicySection heading="Legal review required">
        <PendingNotice>
          This document has not been reviewed by a lawyer and does not yet identify the operating
          legal entity. It describes the current technical behaviour of the site only, and must be
          completed and reviewed before the store takes orders.
        </PendingNotice>
      </PolicySection>

      <PolicySection heading="What this site stores">
        <p>
          Your cart is stored in your own browser&apos;s local storage. It contains product
          identifiers and quantities only — no personal details, no payment information. Clearing
          your browser data removes it.
        </p>
        <p>
          No account system is connected, so no profile, address or order history is stored
          anywhere.
        </p>
      </PolicySection>

      <PolicySection heading="Payments">
        <p>
          No payment provider is connected to this build and no payment can be taken. The site never
          receives, processes or stores card details.
        </p>
      </PolicySection>

      <PolicySection heading="Email signup">
        <p>
          The signup form validates the address you enter and returns a confirmation, but no email
          provider is connected, so the address is not stored or transmitted anywhere.
        </p>
        <PendingNotice>
          Once a provider is connected, this section must state who processes the data, where it is
          held, and how to unsubscribe.
        </PendingNotice>
      </PolicySection>

      <PolicySection heading="Analytics and cookies">
        <p>
          No analytics provider is connected and no tracking or advertising cookies are set by this
          site.
        </p>
        <PendingNotice>
          If analytics are added, this section and a consent mechanism must be in place before they
          go live.
        </PendingNotice>
      </PolicySection>

      <PolicySection heading="Contact">
        <p>
          For privacy questions, use the{' '}
          <a href="/contact" className="text-fg underline underline-offset-4">
            contact page
          </a>
          .
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
