import type { Metadata } from 'next';

import { PolicyPage } from '@/components/content/PolicyPage';
import { PublishedPolicy } from '@/components/content/PublishedPolicy';

export const metadata: Metadata = {
  title: 'Terms',
  description: 'INFNITY Terms — as published by Infnity.clo.',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <PolicyPage title="Terms">
      <PublishedPolicy handle="terms-of-service" />
    </PolicyPage>
  );
}
