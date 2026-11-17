import type { Metadata } from 'next';

import {
  CarriedOverNotice,
  PolicyBlocks,
  PolicyPage,
  type PolicyBlock,
} from '@/components/content/PolicyPage';
import privacy from '@/data/legal/privacy.json';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How INFNITY collects, uses and protects your personal information.',
  alternates: { canonical: '/privacy' },
};

/**
 * The store's privacy policy, imported block-for-block from infinityclo.ca
 * (src/data/legal/privacy.json). The first block is the policy's own title,
 * which the page heading replaces.
 */
export default function PrivacyPage() {
  const blocks = (privacy as PolicyBlock[]).slice(1);
  return (
    <PolicyPage title="Privacy Policy" note={<CarriedOverNotice />}>
      <PolicyBlocks blocks={blocks} />
    </PolicyPage>
  );
}
