import type { Metadata } from 'next';

import { PolicyPage } from '@/components/content/PolicyPage';
import { PublishedPolicy } from '@/components/content/PublishedPolicy';

export const metadata: Metadata = {
  title: 'Contact information',
  description: 'INFNITY Contact information — as published by Infnity.clo.',
  alternates: { canonical: '/contact-information' },
};

export default function ContactInformationPage() {
  return (
    <PolicyPage title="Contact information">
      <PublishedPolicy handle="contact-information" />
    </PolicyPage>
  );
}
