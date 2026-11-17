import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import {
  AccountLayout,
  HostedAccountNotice,
  SignInPrompt,
} from '@/components/account/AccountShell';
import { ORDER_STATE_LABELS, orderState } from '@/domain/order-status';
import { accountState, formatShopifyMoney, loadOverview } from '@/server/account';
import { shopifyConfig } from '@/server/shopify/config';

export const metadata: Metadata = { title: 'Orders', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function OrdersPage() {
  const state = await accountState('/account/orders');
  if (state.kind === 'not_configured') {
    return (
      <AccountLayout title="Orders" signedIn={false}>
        <HostedAccountNotice accountUrl={shopifyConfig().hostedAccountUrl} />
      </AccountLayout>
    );
  }
  if (state.kind === 'signed_out') {
    return (
      <AccountLayout title="Orders" signedIn={false}>
        <SignInPrompt returnTo="/account/orders" />
      </AccountLayout>
    );
  }
  const { customer } = await loadOverview(state.accessToken);
  return (
    <AccountLayout title="Orders" signedIn>
      {customer.orders.nodes.length === 0 ? (
        <p className="text-fg-muted text-sm">You haven’t placed an order yet.</p>
      ) : (
        <ul className="flex flex-col gap-4" data-testid="order-list">
          {customer.orders.nodes.map((order) => {
            const status = orderState({
              financialStatus: order.financialStatus,
              fulfillmentStatus: order.fulfillmentStatus,
              cancelledAt: order.cancelledAt,
              fulfillments: order.fulfillments.nodes.map((f) => ({
                status: f.status,
                latestShipmentStatus: f.latestShipmentStatus,
                trackingNumbers: f.trackingInformation.map((t) => t.number ?? '').filter(Boolean),
              })),
            });
            return (
              <li key={order.id} className="border-line border">
                <Link
                  href={`/account/orders/${order.id.split('/').pop()}`}
                  className="flex items-center gap-4 p-4 hover:opacity-80"
                >
                  <div className="flex -space-x-3">
                    {order.lineItems.nodes.slice(0, 3).map((item, index) =>
                      item.image ? (
                        <div
                          key={index}
                          className="bg-surface-sunken border-paper relative h-14 w-14 overflow-hidden border-2"
                        >
                          <Image
                            src={item.image.url}
                            alt={item.image.altText ?? item.title}
                            fill
                            sizes="56px"
                            className="object-cover"
                          />
                        </div>
                      ) : null,
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{order.name}</p>
                    <p className="text-fg-muted text-sm">
                      {new Date(order.processedAt).toLocaleDateString('en-CA', {
                        dateStyle: 'medium',
                      })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm">{ORDER_STATE_LABELS[status]}</p>
                    <p className="text-fg-muted text-sm tabular-nums">
                      {formatShopifyMoney(order.totalPrice)}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </AccountLayout>
  );
}
