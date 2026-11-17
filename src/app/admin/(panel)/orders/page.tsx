import type { Metadata } from 'next';
import Link from 'next/link';

import { OrderStatusBadges } from '@/components/admin/OrderStatus';
import { Button, Disconnected, Empty, Flash, LinkButton, PageHeader, TableWrap, formatDate, formatMoney, inputClass, td, th } from '@/components/admin/ui';
import { REQUIRED_ADMIN_SCOPES, getGateway, type AdminOrderSummary, type OrderQuery } from '@/server/admin/gateway';
import { param, requirePage, type SearchParams } from '@/server/admin/page';
import { can } from '@/server/admin/permissions';

import { createTestOrderAction } from '../../actions/commerce';

export const metadata: Metadata = { title: 'Orders' };

const PAYMENTS = ['paid', 'pending', 'refunded', 'partially_refunded'] as const;
const FULFILLMENTS = ['unfulfilled', 'partial', 'fulfilled'] as const;
const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

export default async function AdminOrdersPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requirePage('orders.view');
  const params = await searchParams;
  const gateway = await getGateway();

  const payment = param(params, 'payment');
  const fulfillment = param(params, 'fulfillment');
  const query: OrderQuery = {
    search: param(params, 'q'),
    payment: (PAYMENTS as readonly string[]).includes(payment) ? (payment as OrderQuery['payment']) : '',
    fulfillment: (FULFILLMENTS as readonly string[]).includes(fulfillment) ? (fulfillment as OrderQuery['fulfillment']) : '',
    from: isDate(param(params, 'from')) ? param(params, 'from') : undefined,
    to: isDate(param(params, 'to')) ? param(params, 'to') : undefined,
  };

  let orders: AdminOrderSummary[] = [];
  let error: string | null = null;
  if (gateway) {
    try {
      orders = await gateway.listOrders(query);
    } catch (caught) {
      error = (caught as Error).message;
    }
  }

  const exportQuery = new URLSearchParams(
    Object.entries({ q: query.search, payment: query.payment, fulfillment: query.fulfillment, from: query.from, to: query.to }).filter(
      (entry): entry is [string, string] => Boolean(entry[1]),
    ),
  ).toString();

  return (
    <>
      <PageHeader
        title="Orders"
        description={gateway ? `Source: ${gateway.sourceLabel}. Payment and fulfilment states are shown exactly as the source reports them.` : undefined}
        actions={
          gateway ? (
            <>
              {can(session.role, 'orders.export') && (
                <LinkButton href={`/api/admin/export/orders${exportQuery ? `?${exportQuery}` : ''}`} external testId="orders-export">Export CSV</LinkButton>
              )}
              {gateway.mode === 'sandbox' && can(session.role, 'orders.edit') && (
                <form action={createTestOrderAction}>
                  <Button variant="secondary" testId="create-test-order">Create test order</Button>
                </form>
              )}
            </>
          ) : undefined
        }
      />
      <Flash params={params} />
      {!gateway ? (
        <Disconnected module="Orders" scopes={REQUIRED_ADMIN_SCOPES} />
      ) : (
        <>
          <form method="get" role="search" aria-label="Filter orders" className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
            <div className="lg:col-span-2">
              <label htmlFor="q" className="mb-1 block text-xs font-semibold uppercase">Search</label>
              <input id="q" name="q" defaultValue={query.search} placeholder="Order number, name or email" className={inputClass} />
            </div>
            <div>
              <label htmlFor="payment" className="mb-1 block text-xs font-semibold uppercase">Payment</label>
              <select id="payment" name="payment" defaultValue={query.payment} className={inputClass}>
                <option value="">Any</option>
                <option value="paid">Paid</option>
                <option value="pending">Pending payment</option>
                <option value="partially_refunded">Partially refunded</option>
                <option value="refunded">Refunded</option>
              </select>
            </div>
            <div>
              <label htmlFor="fulfillment" className="mb-1 block text-xs font-semibold uppercase">Fulfilment</label>
              <select id="fulfillment" name="fulfillment" defaultValue={query.fulfillment} className={inputClass}>
                <option value="">Any</option>
                <option value="unfulfilled">Unfulfilled</option>
                <option value="partial">Partially fulfilled</option>
                <option value="fulfilled">Fulfilled</option>
              </select>
            </div>
            <div>
              <label htmlFor="from" className="mb-1 block text-xs font-semibold uppercase">From</label>
              <input id="from" name="from" type="date" defaultValue={query.from} className={inputClass} />
            </div>
            <div>
              <label htmlFor="to" className="mb-1 block text-xs font-semibold uppercase">To</label>
              <input id="to" name="to" type="date" defaultValue={query.to} className={inputClass} />
            </div>
            <div className="lg:col-span-6"><Button variant="secondary">Filter</Button></div>
          </form>

          {error && <p role="alert" className="mb-4 border border-red-700 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</p>}

          {orders.length === 0 && !error ? (
            <Empty title="No orders to show">
              {gateway.mode === 'sandbox'
                ? 'The sandbox contains no orders: real orders are never copied or invented. Use “Create test order” to try the workflow with an order clearly marked TEST.'
                : 'No orders match these filters.'}
            </Empty>
          ) : (
            <TableWrap label="Orders">
              <thead>
                <tr>
                  <th className={th}>Order</th>
                  <th className={th}>Placed</th>
                  <th className={th}>Customer</th>
                  <th className={th}>Status</th>
                  <th className={th}>Items</th>
                  <th className={th}>Total</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} data-testid="order-row">
                    <td className={td}>
                      <Link href={`/admin/orders/${order.id}`} className="font-semibold underline underline-offset-4">{order.name}</Link>
                    </td>
                    <td className={td}>{formatDate(order.createdAt)}</td>
                    <td className={td}>
                      {order.customerName ?? '—'}
                      {order.email && <span className="block text-xs text-neutral-600">{order.email}</span>}
                    </td>
                    <td className={td}><OrderStatusBadges status={order.status} test={order.test} /></td>
                    <td className={`${td} tabular-nums`}>{order.itemCount}</td>
                    <td className={`${td} tabular-nums`}>{formatMoney(order.total)}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
          <p className="mt-3 text-xs text-neutral-600">Showing up to 100 most recent matching orders. Narrow the dates to reach older ones.</p>
        </>
      )}
    </>
  );
}
