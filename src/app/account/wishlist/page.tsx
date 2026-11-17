import type { Metadata } from 'next';

import { AccountShell } from '@/components/account/AccountShell';
import { WishlistList } from '@/components/account/WishlistList';
import { currentCustomer } from '@/server/commerce/session';

export const metadata: Metadata = { title: 'Wishlist' };
export const dynamic = 'force-dynamic';

/** The wishlist is device-local, so this page works signed in or out. */
export default async function WishlistPage() {
  const signedIn = (await currentCustomer()) !== null;
  return (
    <AccountShell title="Wishlist" current="/account/wishlist" signedIn={signedIn}>
      <WishlistList />
    </AccountShell>
  );
}
