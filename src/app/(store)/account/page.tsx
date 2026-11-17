import type { Metadata } from 'next';
import Link from 'next/link';

import { AccountLayout, HostedAccountNotice, SignInPrompt } from '@/components/account/AccountShell';
import { humanise, ORDER_STATE_LABELS, orderState } from '@/domain/order-status';
import { accountState, formatShopifyMoney, loadOverview } from '@/server/account';
import { shopifyConfig } from '@/server/shopify/config';

export const metadata: Metadata = { title: 'Account', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const state = await accountState('/account');
  if (state.kind === 'not_configured') {
    return (
      <AccountLayout title="Account" signedIn={false}>
        <HostedAccountNotice accountUrl={shopifyConfig().hostedAccountUrl} />
      </AccountLayout>
    );
  }
  if (state.kind === 'signed_out') {
    return (
      <AccountLayout title="Account" signedIn={false}>
        <SignInPrompt returnTo="/account" error={error} />
      </AccountLayout>
    );
  }

  const { customer } = await loadOverview(state.accessToken);
  const marketing = customer.emailAddress?.marketingState ?? null;
  return (
    <AccountLayout title={`Hi${customer.firstName ? `, ${customer.firstName}` : ''}`} signedIn>
      <div className="grid gap-8 md:grid-cols-2">
        <section className="border-line border p-6" aria-labelledby="profile-heading">
          <h2 id="profile-heading" className="text-fg-faint text-[0.66rem] font-semibold tracking-[0.24em] uppercase">Profile</h2>
          <p className="text-fg mt-4 font-medium">{customer.displayName}</p>
          <p className="text-fg-muted text-sm">{customer.emailAddress?.emailAddress}</p>
          {customer.phoneNumber && <p className="text-fg-muted text-sm">{customer.phoneNumber.phoneNumber}</p>}
          <p className="text-fg-muted mt-4 text-sm">
            Marketing emails: <span className="text-fg">{marketing === 'SUBSCRIBED' ? 'Subscribed' : humanise(marketing)}</span>
          </p>
          <p className="text-fg-faint mt-1 text-xs">Order and shipping emails always arrive, whatever you choose here.</p>
          <Link href="/#newsletter" className="mt-3 inline-block text-sm underline underline-offset-4">
            Manage early-access emails
          </Link>
        </section>
        <section className="border-line border p-6" aria-labelledby="address-heading">
          <h2 id="address-heading" className="text-fg-faint text-[0.66rem] font-semibold tracking-[0.24em] uppercase">Addresses</h2>
          {customer.addresses.nodes.length === 0 ? (
            <p className="text-fg-muted mt-4 text-sm">No saved addresses yet. They’re saved when you check out.</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-4">
              {customer.addresses.nodes.map((address) => (
                <li key={address.id} className="text-fg-muted text-sm">
                  {address.id === customer.defaultAddress?.id && <span className="text-fg mb-1 block text-xs font-semibold uppercase">Default</span>}
                  {address.formatted.map((line) => (
                    <span key={line} className="block">{line}</span>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="mt-10" aria-labelledby="recent-heading">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 id="recent-heading" className="text-fg-faint text-[0.66rem] font-semibold tracking-[0.24em] uppercase">Recent orders</h2>
          <Link href="/account/orders" className="text-sm underline underline-offset-4">All orders</Link>
        </div>
        {customer.orders.nodes.length === 0 ? (
          <p className="text-fg-muted text-sm">No orders yet.</p>
        ) : (
          <ul className="divide-line border-line divide-y border-y">
            {customer.orders.nodes.slice(0, 3).map((order) => {
              const status = orderState({
                financialStatus: order.financialStatus,
                fulfillmentStatus: order.fulfillmentStatus,
                cancelledAt: order.cancelledAt,
                fulfillments: order.fulfillments.nodes.map((f) => ({ status: f.status, latestShipmentStatus: f.latestShipmentStatus, trackingNumbers: f.trackingInformation.map((t) => t.number ?? '').filter(Boolean) })),
              });
              return (
                <li key={order.id}>
                  <Link href={`/account/orders/${order.id.split('/').pop()}`} className="flex flex-wrap items-center justify-between gap-2 py-4 hover:opacity-80">
                    <span className="font-medium">{order.name}</span>
                    <span className="text-fg-muted text-sm">{new Date(order.processedAt).toLocaleDateString('en-CA', { dateStyle: 'medium' })}</span>
                    <span className="text-sm">{ORDER_STATE_LABELS[status]}</span>
                    <span className="text-sm tabular-nums">{formatShopifyMoney(order.totalPrice)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </AccountLayout>
  );
}
