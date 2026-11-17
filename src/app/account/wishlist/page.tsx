import type { Metadata } from 'next';

import { AccountShell } from '@/components/account/AccountShell';
import { WishlistList } from '@/components/account/WishlistList';
import { isCustomerAuthConfigured } from '@/server/shopify/customer-account';
import { readSession } from '@/server/customer/session';

export const metadata: Metadata = { title: 'Wishlist' };

/** The wishlist is device-local, so this page works signed in or out. */
export default async function WishlistPage() {
  const signedIn = isCustomerAuthConfigured() && (await readSession()) !== null;
  return (
    <AccountShell title="Wishlist" current="/account/wishlist" signedIn={signedIn}>
      <WishlistList />
    </AccountShell>
  );
}
