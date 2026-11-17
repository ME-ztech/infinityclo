import type { Metadata } from 'next';
import Link from 'next/link';

import { AccountShell, FIELD, LABEL, SUBMIT, Unavailable } from '@/components/account/AccountShell';
import { firstParam, formatDate, GuestAccount } from '@/components/account/GuestAccount';
import { accountContext, loadForPage } from '@/server/customer/context';
import { readFlash } from '@/server/customer/session';

export const metadata: Metadata = { title: 'Help & returns' };

const PAGE = '/account/help';

/**
 * Help, returns and exchanges.
 *
 * The policy summary below restates the store's published refund policy. A
 * request made here opens a ticket for the team; it does not approve a return
 * or move any money.
 */
export default async function HelpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const context = await accountContext(PAGE);
  if (context.state !== 'signed_in') return <GuestAccount title="Help & returns" current={PAGE} context={context} />;

  const loaded = await loadForPage(PAGE, () => context.gateway.listOrders(context.session.accessToken, 30));
  if ('error' in loaded) {
    return (
      <AccountShell title="Help & returns" current={PAGE} signedIn>
        <Unavailable message={loaded.error} />
      </AccountShell>
    );
  }

  const orders = loaded.data;
  const flash = await readFlash();
  const preselected = firstParam(params.order);
  const selected = orders.some((order) => order.id === preselected) ? preselected : '';

  return (
    <AccountShell title="Help & returns" current={PAGE} signedIn notice={flash.notice} error={flash.error}>
      <section className="border-line border p-6 text-sm md:p-8" aria-labelledby="returns-policy">
        <h2 id="returns-policy" className="font-display text-fg mb-4 text-xl">
          How returns work
        </h2>
        <ul className="text-fg-muted list-disc space-y-2 pl-5 leading-relaxed">
          <li>You have 10 days after receiving your item to request a return.</li>
          <li>Items must be unworn or unused, with tags, in the original packaging, with proof of purchase.</li>
          <li>Sale items and gift cards cannot be returned.</li>
          <li>For an exchange, return the item and place a new order once the return is accepted.</li>
          <li>
            Every request is reviewed by the team. Nothing is refunded or cancelled automatically —
            if a refund is approved it goes back to your original payment method.
          </li>
        </ul>
        <p className="text-fg-muted mt-4">
          Read the full{' '}
          <Link href="/returns" className="text-fg underline underline-offset-4">
            returns policy
          </Link>
          .
        </p>
      </section>

      <section className="border-line mt-8 border p-6 md:p-8" aria-labelledby="help-request">
        <h2 id="help-request" className="font-display text-fg mb-6 text-xl">
          Send a request
        </h2>
        <form action="/api/account/help" method="post" className="space-y-4">
          <div>
            <label htmlFor="help-kind" className={LABEL}>
              What do you need?
            </label>
            <select id="help-kind" name="kind" required defaultValue="return" className={FIELD}>
              <option value="return">Return an item</option>
              <option value="exchange">Exchange an item</option>
              <option value="order">Question about an order</option>
              <option value="sizing">Sizing help</option>
              <option value="other">Something else</option>
            </select>
          </div>
          <div>
            <label htmlFor="help-order" className={LABEL}>
              Order
            </label>
            <select id="help-order" name="orderId" defaultValue={selected} aria-describedby="help-order-hint" className={FIELD}>
              <option value="">No specific order</option>
              {orders.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.name} — {formatDate(order.processedAt)}
                </option>
              ))}
            </select>
            <p id="help-order-hint" className="text-fg-muted mt-1 text-xs">
              Required for returns and exchanges.
            </p>
          </div>
          <div>
            <label htmlFor="help-message" className={LABEL}>
              Details
            </label>
            <textarea
              id="help-message"
              name="message"
              required
              minLength={10}
              maxLength={3000}
              rows={6}
              aria-describedby="help-message-hint"
              className={`${FIELD} h-auto py-3`}
            />
            <p id="help-message-hint" className="text-fg-muted mt-1 text-xs">
              Tell us which item and size, and what happened. Please don’t include card details.
            </p>
          </div>
          <button type="submit" className={SUBMIT}>
            Send request
          </button>
        </form>
      </section>
    </AccountShell>
  );
}
