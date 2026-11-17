import Link from 'next/link';

import {
  AdminPage,
  Badge,
  DownloadLink,
  NotConnected,
  Table,
  Td,
  formatCad,
  formatDate,
} from '@/components/admin/ui';
import { humanise } from '@/domain/order-status';
import { requireStaffPage } from '@/server/auth/staff';
import { isAdminConfigured } from '@/server/shopify/config';
import { listOrders } from '@/server/shopify/admin';

export const metadata = { title: 'Orders' };

const FILTERS: Record<string, { label: string; query: string }> = {
  all: { label: 'All', query: '' },
  unfulfilled: {
    label: 'Paid, awaiting fulfilment',
    query: 'financial_status:paid fulfillment_status:unfulfilled status:open',
  },
  pending: { label: 'Pending payment', query: 'financial_status:pending' },
  fulfilled: { label: 'Fulfilled', query: 'fulfillment_status:shipped' },
  cancelled: { label: 'Cancelled', query: 'status:cancelled' },
  refunded: {
    label: 'Refunded',
    query: 'financial_status:refunded OR financial_status:partially_refunded',
  },
  requests: {
    label: 'Cancel/refund requested',
    query: 'tag:cancel-requested OR tag:refund-requested',
  },
};

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; after?: string }>;
}) {
  await requireStaffPage('orders:read', '/admin/orders');
  const { q, status = 'all', after } = await searchParams;
  if (!isAdminConfigured()) {
    return (
      <AdminPage
        title="Orders"
        description="Orders are Shopify’s record; this screen reads them live."
      >
        <NotConnected
          what="Orders, fulfilment and tracking"
          envVar="SHOPIFY_ADMIN_ACCESS_TOKEN"
          scopes="read_orders, write_orders, read_merchant_managed_fulfillment_orders, write_merchant_managed_fulfillment_orders"
        />
      </AdminPage>
    );
  }
  const filter = FILTERS[status] ?? FILTERS.all!;
  const query = [filter.query, q].filter(Boolean).join(' ');
  const { orders, pageInfo } = await listOrders(query || null, after ?? null);
  return (
    <AdminPage
      title="Orders"
      description="Live from Shopify. Statuses are Shopify’s own."
      actions={
        <DownloadLink href={`/admin/export/orders?${new URLSearchParams({ q: query })}`}>
          Export CSV
        </DownloadLink>
      }
    >
      <div className="flex flex-wrap gap-2 text-sm">
        {Object.entries(FILTERS).map(([key, value]) => (
          <Link
            key={key}
            href={`/admin/orders?status=${key}`}
            className={
              key === status
                ? 'bg-ink text-paper px-3 py-1.5'
                : 'border-line border bg-white px-3 py-1.5'
            }
          >
            {value.label}
          </Link>
        ))}
      </div>
      <form className="flex gap-2">
        <input type="hidden" name="status" value={status} />
        <input
          name="q"
          defaultValue={q}
          placeholder="Order #, email or customer name"
          className="border-line h-10 w-full max-w-sm border bg-white px-3 text-sm"
          aria-label="Search orders"
        />
        <button className="border-ink h-10 border px-4 text-xs font-semibold uppercase">
          Search
        </button>
      </form>
      <Table
        head={['Order', 'Date', 'Customer', 'Payment', 'Fulfilment', 'Items', 'Total']}
        empty={orders.length ? undefined : 'No orders match.'}
      >
        {orders.map((order) => (
          <tr key={order.id}>
            <Td>
              <Link
                href={`/admin/orders/${order.id.split('/').pop()}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {order.name}
              </Link>{' '}
              {order.test && <Badge tone="info">Test</Badge>}{' '}
              {order.cancelledAt && <Badge tone="bad">Cancelled</Badge>}
            </Td>
            <Td>{formatDate(order.processedAt)}</Td>
            <Td>{order.customerName ?? order.email ?? 'Guest'}</Td>
            <Td>
              <Badge
                tone={
                  order.financialStatus === 'PAID'
                    ? 'good'
                    : order.financialStatus?.includes('REFUND')
                      ? 'bad'
                      : 'warn'
                }
              >
                {humanise(order.financialStatus)}
              </Badge>
            </Td>
            <Td>
              <Badge tone={order.fulfillmentStatus === 'FULFILLED' ? 'good' : 'warn'}>
                {humanise(order.fulfillmentStatus)}
              </Badge>
            </Td>
            <Td>{order.itemCount}</Td>
            <Td>{formatCad(order.total.amount, order.total.currencyCode)}</Td>
          </tr>
        ))}
      </Table>
      {pageInfo.hasNextPage && (
        <Link
          href={`/admin/orders?${new URLSearchParams({ status, ...(q ? { q } : {}), after: pageInfo.endCursor ?? '' })}`}
          className="self-start text-sm underline"
        >
          Next page →
        </Link>
      )}
    </AdminPage>
  );
}
