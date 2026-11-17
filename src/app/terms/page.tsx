import type { Metadata } from 'next';

import {
  CarriedOverNotice,
  PolicyBlocks,
  PolicyPage,
  type PolicyBlock,
} from '@/components/content/PolicyPage';
import terms from '@/data/legal/terms.json';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The terms that apply to using the INFNITY store.',
  alternates: { canonical: '/terms' },
};

/**
 * The store's terms of service, imported block-for-block from infinityclo.ca
 * (src/data/legal/terms.json).
 */
export default function TermsPage() {
  return (
    <PolicyPage title="Terms of Service" note={<CarriedOverNotice />}>
      <PolicyBlocks blocks={terms as PolicyBlock[]} />
    </PolicyPage>
  );
}
