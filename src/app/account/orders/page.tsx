import type { Metadata } from 'next';

import { AccountShell } from '@/components/account/AccountShell';

export const metadata: Metadata = {
  title: 'Orders',
  robots: { index: false, follow: false },
};

export default function OrdersPage() {
  return (
    <AccountShell
      title="Orders"
      description="Your order history will appear here once checkout and accounts are connected. No orders exist yet because no payment can be taken in this build."
    />
  );
}
