import type { Metadata } from 'next';

import { PolicyPage } from '@/components/content/PolicyPage';
import { PublishedPolicy } from '@/components/content/PublishedPolicy';

export const metadata: Metadata = {
  title: 'Shipping',
  description: 'INFNITY Shipping — as published by Infnity.clo.',
  alternates: { canonical: '/shipping' },
};

export default function ShippingPage() {
  return (
    <PolicyPage title="Shipping">
      <PublishedPolicy handle="shipping-policy" />
    </PolicyPage>
  );
}
