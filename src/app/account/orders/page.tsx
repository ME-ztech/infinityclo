import type { Metadata } from 'next';
import Link from 'next/link';

import { AccountShell } from '@/components/account/AccountShell';
import { ButtonLink } from '@/components/ui/Button';
import { orderProgress } from '@/domain/order-progress';
import { listOrdersForCustomer } from '@/server/commerce/orders';
import { requireCustomerPage } from '@/server/commerce/session';

export const metadata: Metadata = { title: 'Orders', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency }).format(cents / 100);

export default async function OrdersPage() {
  const customer = await requireCustomerPage('/account/orders');
  const orders = await listOrdersForCustomer(customer.id);

  return (
    <AccountShell title="Orders" current="/account/orders" signedIn>
      {orders.length === 0 ? (
        <div className="border-line border p-8 text-center md:p-12" data-testid="orders-empty">
          <p className="text-fg-muted text-sm">No orders yet. When you place one, it will appear here with its tracking.</p>
          <div className="mt-6">
            <ButtonLink href="/shop" variant="primary" size="md">
              Shop
            </ButtonLink>
          </div>
        </div>
      ) : (
        <ul className="divide-line border-line divide-y border" data-testid="orders-list">
          {orders.map((order) => (
            <li key={order.id}>
              <Link href={`/account/orders/${order.id}`} className="hover:bg-surface-sunken flex flex-wrap items-center gap-x-8 gap-y-2 p-5">
                <span className="text-fg w-24 font-semibold">{order.name}</span>
                <span className="text-fg-muted text-sm">
                  {order.placedAt.toLocaleDateString('en-CA', { dateStyle: 'medium' })}
                </span>
                <span className="text-fg flex-1 text-sm">
                  {
                    orderProgress({
                      paymentStatus: order.paymentStatus,
                      fulfillmentStatus: order.fulfillmentStatus,
                      cancelled: order.cancelledAt !== null,
                      shipments: [],
                    }).label
                  }
                </span>
                <span className="text-fg text-sm font-semibold">{money(order.totalCents, order.currency)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AccountShell>
  );
}
