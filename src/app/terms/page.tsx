import type { Metadata } from 'next';

import { PendingNotice, PolicyPage, PolicySection } from '@/components/content/PolicyPage';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms governing use of the INFNITY storefront.',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <PolicyPage title="Terms of Service" intro="Terms governing use of this site.">
      <PolicySection heading="Legal review required">
        <PendingNotice>
          This document is incomplete and has not been reviewed by a lawyer. The operating legal
          entity, governing jurisdiction and dispute terms are not yet established. It must be
          completed and reviewed before the store takes orders.
        </PendingNotice>
      </PolicySection>

      <PolicySection heading="This is a preview storefront">
        <p>
          No payment provider is connected. No order can be placed, no contract of sale is formed,
          and nothing on this site will result in a charge.
        </p>
        <p>Prices and product information shown are for preview and may change without notice.</p>
      </PolicySection>

      <PolicySection heading="Product representation">
        <p>
          Product imagery and descriptions are the brand&apos;s own. Colours may appear differently
          between screens. Where a garment specification has not been confirmed it is left blank
          rather than estimated.
        </p>
      </PolicySection>

      <PolicySection heading="Intellectual property">
        <p>
          The INFNITY name, wordmark, imagery and product designs belong to the brand and may not be
          reproduced without permission.
        </p>
      </PolicySection>

      <PolicySection heading="Contact">
        <p>
          Questions about these terms can go through the{' '}
          <a href="/contact" className="text-fg underline underline-offset-4">
            contact page
          </a>
          .
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
