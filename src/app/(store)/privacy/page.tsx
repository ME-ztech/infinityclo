import type { Metadata } from 'next';

import { PolicyPage } from '@/components/content/PolicyPage';
import { PublishedPolicy } from '@/components/content/PublishedPolicy';

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'INFNITY Privacy — as published by Infnity.clo.',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <PolicyPage title="Privacy">
      <PublishedPolicy handle="privacy-policy" />
    </PolicyPage>
  );
}
