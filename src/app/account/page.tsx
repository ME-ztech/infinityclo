import type { Metadata } from 'next';
import Link from 'next/link';

import { AccountShell, authErrorMessage, Unavailable } from '@/components/account/AccountShell';
import { firstParam, formatAmount, formatDate, GuestAccount } from '@/components/account/GuestAccount';
import { accountContext, loadForPage } from '@/server/customer/context';
import { readFlash } from '@/server/customer/session';
import { financialLabel, orderProgress } from '@/server/customer/order-status';

export const metadata: Metadata = { title: 'Account' };

type Params = Promise<Record<string, string | string[] | undefined>>;

const MARKETING_COPY: Record<string, string> = {
  SUBSCRIBED: 'You are subscribed to marketing emails.',
  UNSUBSCRIBED: 'You are not subscribed to marketing emails.',
  PENDING: 'Your subscription is awaiting confirmation.',
};

export default async function AccountPage({ searchParams }: { searchParams: Params }) {
  const params = await searchParams;
  const context = await accountContext('/account');
  if (context.state !== 'signed_in') {
    return (
      <GuestAccount
        title="Account"
        current="/account"
        context={context}
        error={firstParam(params.error)}
        signedOut={firstParam(params.signed_out) === '1'}
      />
    );
  }

  const { session, gateway } = context;
  const loaded = await loadForPage('/account', async () => {
    const [profile, orders] = await Promise.all([
      gateway.getProfile(session.accessToken),
      gateway.listOrders(session.accessToken, 3),
    ]);
    return { profile, orders };
  });

  if ('error' in loaded) {
    return (
      <AccountShell title="Account" current="/account" signedIn>
        <Unavailable message={loaded.error} />
      </AccountShell>
    );
  }

  const { profile, orders } = loaded.data;
  const flash = await readFlash();
  return (
    <AccountShell
      title="Account"
      current="/account"
      signedIn
      error={flash.error ?? authErrorMessage(firstParam(params.error))}
      notice={flash.notice}
    >
      <div className="grid gap-6 md:grid-cols-2">
        <section className="border-line border p-6 md:p-8" aria-labelledby="account-details">
          <h2 id="account-details" className="font-display text-fg text-xl">
            Your details
          </h2>
          <dl className="mt-5 space-y-3 text-sm">
            <div>
              <dt className="text-fg-muted text-xs uppercase tracking-[0.14em]">Name</dt>
              <dd className="text-fg mt-1" data-testid="account-name">
                {profile.displayName || [profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'Not set'}
              </dd>
            </div>
            <div>
              <dt className="text-fg-muted text-xs uppercase tracking-[0.14em]">Email</dt>
              <dd className="text-fg mt-1 break-all" data-testid="account-email">
                {profile.email ?? 'Not set'}
              </dd>
            </div>
          </dl>
          <Link href="/account/profile" className="text-fg mt-6 inline-block text-xs font-semibold uppercase tracking-[0.16em] underline underline-offset-4">
            Edit profile
          </Link>
        </section>

        <section className="border-line border p-6 md:p-8" aria-labelledby="account-marketing">
          <h2 id="account-marketing" className="font-display text-fg text-xl">
            Email preferences
          </h2>
          <p className="text-fg-muted mt-5 text-sm leading-relaxed" data-testid="account-marketing-state">
            {profile.marketingState
              ? (MARKETING_COPY[profile.marketingState] ?? 'Your marketing preference could not be determined.')
              : 'Your marketing preference could not be determined.'}
          </p>
          <p className="text-fg-muted mt-3 text-sm leading-relaxed">
            Having an account does not sign you up for marketing. Order and shipping emails are
            always sent.
          </p>
          <Link href="/account/profile" className="text-fg mt-6 inline-block text-xs font-semibold uppercase tracking-[0.16em] underline underline-offset-4">
            Change preference
          </Link>
        </section>
      </div>

      <section className="mt-10" aria-labelledby="account-recent">
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2 id="account-recent" className="font-display text-fg text-xl">
            Recent orders
          </h2>
          <Link href="/account/orders" className="text-fg-muted hover:text-fg text-xs font-semibold uppercase tracking-[0.16em]">
            All orders
          </Link>
        </div>
        {orders.length === 0 ? (
          <p className="border-line text-fg-muted border p-6 text-sm">You have not placed an order yet.</p>
        ) : (
          <ul className="border-line divide-line divide-y border">
            {orders.map((order) => (
              <li key={order.id}>
                <Link href={`/account/orders/${order.id}`} className="hover:bg-fg/[0.03] flex flex-wrap items-center justify-between gap-x-6 gap-y-1 p-5 text-sm">
                  <span className="text-fg font-semibold">{order.name}</span>
                  <span className="text-fg-muted">{formatDate(order.processedAt)}</span>
                  <span className="text-fg-muted">
                    {orderProgress({ ...order, fulfillments: [] }).stage === 'cancelled'
                      ? 'Cancelled'
                      : financialLabel(order.financialStatus)}
                  </span>
                  <span className="text-fg">{formatAmount(order.total)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AccountShell>
  );
}
