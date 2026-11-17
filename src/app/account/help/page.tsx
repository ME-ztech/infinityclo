import type { Metadata } from 'next';
import Link from 'next/link';

import { AccountShell, FIELD, LABEL, SUBMIT, param, type SearchParams } from '@/components/account/AccountShell';
import { listOrdersForCustomer } from '@/server/commerce/orders';
import { requireCustomerPage } from '@/server/commerce/session';

import { helpRequestAction } from '../actions';

export const metadata: Metadata = { title: 'Help & returns', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const TOPICS = [
  { value: 'order', label: 'A question about an order' },
  { value: 'return', label: 'Return or exchange' },
  { value: 'sizing', label: 'Sizing' },
  { value: 'other', label: 'Something else' },
];

export default async function HelpPage({ searchParams }: { searchParams: SearchParams }) {
  const customer = await requireCustomerPage('/account/help');
  const params = await searchParams;
  const orders = await listOrdersForCustomer(customer.id);
  const selected = param(params, 'order');

  return (
    <AccountShell title="Help & returns" current="/account/help" signedIn notice={param(params, 'notice')} error={param(params, 'error')}>
      <div className="max-w-xl">
        <p className="text-fg-muted text-sm leading-relaxed">
          Returns are accepted within 10 days of receiving your order, for items that are unworn, with tags, in their
          original packaging. Sale items cannot be returned. Our team reviews every request and replies by email —
          nothing is refunded or cancelled automatically. See the full{' '}
          <Link href="/returns" className="text-fg underline underline-offset-4">
            returns policy
          </Link>
          .
        </p>

        <form action={helpRequestAction} className="mt-8 space-y-5" data-testid="help-form">
          <div>
            <label htmlFor="help-topic" className={LABEL}>
              What do you need help with?
            </label>
            <select id="help-topic" name="topic" required className={FIELD} defaultValue={selected ? 'order' : ''}>
              <option value="" disabled>
                Choose…
              </option>
              {TOPICS.map((topic) => (
                <option key={topic.value} value={topic.value}>
                  {topic.label}
                </option>
              ))}
            </select>
          </div>
          {orders.length > 0 && (
            <div>
              <label htmlFor="help-order" className={LABEL}>
                Order (optional)
              </label>
              <select id="help-order" name="orderId" className={FIELD} defaultValue={selected ?? ''}>
                <option value="">Not about a specific order</option>
                {orders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.name} — {order.placedAt.toLocaleDateString('en-CA', { dateStyle: 'medium' })}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label htmlFor="help-message" className={LABEL}>
              Details
            </label>
            <textarea id="help-message" name="message" required minLength={10} maxLength={4000} rows={6} className={`${FIELD} h-auto py-3`} />
          </div>
          <button type="submit" className={SUBMIT}>
            Send request
          </button>
        </form>
      </div>
    </AccountShell>
  );
}
