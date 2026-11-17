import type { Metadata } from 'next';
import Link from 'next/link';

import { AccountShell, Unavailable } from '@/components/account/AccountShell';
import { formatAmount, formatDate, GuestAccount } from '@/components/account/GuestAccount';
import { ButtonLink } from '@/components/ui/Button';
import { accountContext, loadForPage } from '@/server/customer/context';
import { financialLabel, fulfillmentLabel } from '@/server/customer/order-status';

export const metadata: Metadata = { title: 'Orders' };

const PAGE = '/account/orders';

export default async function OrdersPage() {
  const context = await accountContext(PAGE);
  if (context.state !== 'signed_in') return <GuestAccount title="Orders" current={PAGE} context={context} />;

  const loaded = await loadForPage(PAGE, () => context.gateway.listOrders(context.session.accessToken, 50));
  if ('error' in loaded) {
    return (
      <AccountShell title="Orders" current={PAGE} signedIn>
        <Unavailable message={loaded.error} />
      </AccountShell>
    );
  }

  const orders = loaded.data;
  return (
    <AccountShell title="Orders" current={PAGE} signedIn>
      {orders.length === 0 ? (
        <div className="border-line border p-8 text-center md:p-12">
          <p className="font-display text-fg text-2xl">No orders yet</p>
          <p className="text-fg-muted mx-auto mt-4 max-w-md text-sm leading-relaxed">
            Orders placed with this email address will appear here.
          </p>
          <div className="mt-8">
            <ButtonLink href="/shop" variant="primary" size="md">
              Shop all
            </ButtonLink>
          </div>
        </div>
      ) : (
        <ul className="border-line divide-line divide-y border" data-testid="order-list">
          {orders.map((order) => (
            <li key={order.id}>
              <Link
                href={`${PAGE}/${order.id}`}
                className="hover:bg-fg/[0.03] grid grid-cols-2 gap-x-6 gap-y-2 p-5 text-sm md:grid-cols-[1fr_1fr_1fr_1fr_auto] md:items-center"
              >
                <span className="text-fg font-semibold">{order.name}</span>
                <span className="text-fg-muted text-right md:text-left">{formatDate(order.processedAt)}</span>
                <span className="text-fg-muted">
                  {order.cancelledAt ? 'Cancelled' : financialLabel(order.financialStatus)}
                </span>
                <span className="text-fg-muted text-right md:text-left">
                  {order.cancelledAt ? '' : fulfillmentLabel(order.fulfillmentStatus)}
                </span>
                <span className="text-fg col-span-2 md:col-span-1 md:text-right">{formatAmount(order.total)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AccountShell>
  );
}
