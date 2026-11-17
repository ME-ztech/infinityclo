import type { Metadata } from 'next';

import { PolicyPage } from '@/components/content/PolicyPage';
import { PublishedPolicy } from '@/components/content/PublishedPolicy';

export const metadata: Metadata = {
  title: 'Returns',
  description: 'INFNITY Returns — as published by Infnity.clo.',
  alternates: { canonical: '/returns' },
};

export default function ReturnsPage() {
  return (
    <PolicyPage title="Returns">
      <PublishedPolicy handle="refund-policy" />
    </PolicyPage>
  );
}
