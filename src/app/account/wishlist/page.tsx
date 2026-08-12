import type { Metadata } from 'next';

import { AccountShell } from '@/components/account/AccountShell';

export const metadata: Metadata = {
  title: 'Wishlist',
  robots: { index: false, follow: false },
};

export default function WishlistPage() {
  return (
    <AccountShell
      title="Wishlist"
      description="Saved pieces will appear here once accounts are connected."
    />
  );
}
