import type { Metadata } from 'next';

import { AccountShell } from '@/components/account/AccountShell';

export const metadata: Metadata = {
  title: 'Account',
  robots: { index: false, follow: false },
};

export default function AccountPage() {
  return (
    <AccountShell
      title="Account"
      description="Order history, saved pieces and addresses live here once accounts are connected."
    />
  );
}
