import type { Metadata } from 'next';
import Link from 'next/link';

import { AccountShell, param, type SearchParams } from '@/components/account/AccountShell';
import { orderProgress } from '@/domain/order-progress';
import { listOrdersForCustomer } from '@/server/commerce/orders';
import { requireCustomerPage } from '@/server/commerce/session';

export const metadata: Metadata = { title: 'Account', robots: { index: false, follow: false } };
// Per-customer data: rendered on every request, never cached.
export const dynamic = 'force-dynamic';

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency }).format(cents / 100);

export default async function AccountPage({ searchParams }: { searchParams: SearchParams }) {
  const customer = await requireCustomerPage('/account');
  const params = await searchParams;
  const orders = await listOrdersForCustomer(customer.id);
  const latest = orders[0];

  return (
    <AccountShell title="Account" current="/account" signedIn notice={param(params, 'notice')} error={param(params, 'error')}>
      <div className="grid gap-8 md:grid-cols-2" data-testid="account-overview">
        <section className="border-line border p-6">
          <h2 className="text-fg-muted text-[0.68rem] font-semibold tracking-[0.16em] uppercase">Signed in as</h2>
          <p className="text-fg mt-3 text-lg font-semibold">
            {`${customer.firstName} ${customer.lastName}`.trim() || 'INFNITY customer'}
          </p>
          <p className="text-fg-muted text-sm" data-testid="account-email">
            {customer.email}
          </p>
          <p className="text-fg-muted mt-4 text-sm">
            Marketing emails:{' '}
            <span className="text-fg">{customer.marketingConsent ? 'Subscribed' : 'Not subscribed'}</span>
            {' · '}
            <Link href="/account/profile" className="underline underline-offset-4">
              Change
            </Link>
          </p>
        </section>

        <section className="border-line border p-6">
          <h2 className="text-fg-muted text-[0.68rem] font-semibold tracking-[0.16em] uppercase">Latest order</h2>
          {latest ? (
            <>
              <p className="text-fg mt-3 text-lg font-semibold">{latest.name}</p>
              <p className="text-fg-muted text-sm">
                {latest.placedAt.toLocaleDateString('en-CA', { dateStyle: 'medium' })} · {money(latest.totalCents, latest.currency)}
              </p>
              <p className="text-fg mt-2 text-sm">
                {
                  orderProgress({
                    paymentStatus: latest.paymentStatus,
                    fulfillmentStatus: latest.fulfillmentStatus,
                    cancelled: latest.cancelledAt !== null,
                    shipments: [],
                  }).label
                }
              </p>
              <Link href={`/account/orders/${latest.id}`} className="text-fg mt-4 inline-block text-sm underline underline-offset-4">
                View order
              </Link>
            </>
          ) : (
            <>
              <p className="text-fg-muted mt-3 text-sm">You haven’t placed an order yet.</p>
              <Link href="/shop" className="text-fg mt-4 inline-block text-sm underline underline-offset-4">
                Shop the catalogue
              </Link>
            </>
          )}
        </section>
      </div>
    </AccountShell>
  );
}
