import type { Metadata } from 'next';
import Link from 'next/link';

import { Badge, Card, Disconnected, Flash, PageHeader, Stat, formatDate, formatMoney } from '@/components/admin/ui';
import { REQUIRED_ADMIN_SCOPES, getGateway, type InventoryRow, type OverviewMetrics } from '@/server/admin/gateway';
import { defaultRange } from '@/server/admin/metrics';
import { requirePage, type SearchParams } from '@/server/admin/page';
import { can } from '@/server/admin/permissions';
import { getAdminSettings } from '@/server/admin/settings';
import { listDrops, listSubscribers, listTickets } from '@/server/records';

export const metadata: Metadata = { title: 'Overview' };

export default async function AdminOverviewPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requirePage('overview.view');
  const params = await searchParams;
  const range = defaultRange(30);
  const gateway = await getGateway();
  const seesCommerce = can(session.role, 'orders.view');
  const seesStock = can(session.role, 'inventory.view');

  let metrics: OverviewMetrics | null = null;
  let lowStock: InventoryRow[] = [];
  let commerceError: string | null = null;
  const { lowStockThreshold } = await getAdminSettings();
  if (gateway) {
    try {
      if (seesCommerce) metrics = await gateway.overview(range);
      if (seesStock) {
        lowStock = (await gateway.listInventory()).filter((row) => row.tracked && row.available <= lowStockThreshold);
      }
    } catch (error) {
      commerceError = (error as Error).message;
    }
  }

  const [subscribers, drops, tickets] = await Promise.all([listSubscribers(), listDrops(), listTickets()]);
  const since = `${range.from}T00:00:00.000Z`;
  const newOptIns = subscribers.filter((subscriber) => subscriber.status === 'subscribed' && subscriber.subscribedAt >= since).length;
  const upcoming = drops.filter((drop) => drop.stage === 'coming_soon' || drop.stage === 'early_access');
  const openTickets = tickets.filter((ticket) => ticket.status !== 'closed').length;

  return (
    <>
      <PageHeader
        title="Overview"
        description={`Last 30 days: ${formatDate(range.from, false)} to ${formatDate(range.to, false)} (UTC). Every figure names its source; nothing here is estimated.`}
      />
      <Flash params={params} />

      {!gateway && <div className="mb-6"><Disconnected module="Sales, orders and stock" scopes={REQUIRED_ADMIN_SCOPES} /></div>}
      {commerceError && (
        <p role="alert" className="mb-6 border border-red-700 bg-red-50 px-4 py-3 text-sm text-red-900">
          Commerce data could not be read: {commerceError}
        </p>
      )}

      {metrics && (
        <Card title="Sales and orders" description={`Source: ${metrics.source}. Currency: ${metrics.currency}.`} testId="overview-sales">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat testId="stat-revenue" label="Confirmed revenue (gross)" value={formatMoney(metrics.grossSales)} note={`Net of refunds: ${formatMoney(metrics.netSales)}. Cancelled orders excluded.`} />
            <Stat testId="stat-orders" label="Orders" value={metrics.ordersCount} note={`${metrics.paidOrders} paid.`} />
            <Stat testId="stat-awaiting" label="Awaiting fulfilment" value={metrics.awaitingFulfillment} note="Paid, not yet fully fulfilled." />
            <Stat testId="stat-customers" label="New customers" value={metrics.newCustomers ?? '—'} note={metrics.newCustomers === null ? 'Not available from this source.' : 'Created in the range.'} />
          </div>
          {(metrics.truncated || metrics.testOrdersExcluded > 0) && (
            <p className="mt-3 text-xs text-neutral-600">
              {metrics.truncated && 'The range holds more orders than were read, so these figures are a floor. '}
              {metrics.testOrdersExcluded > 0 && `${metrics.testOrdersExcluded} test order(s) excluded.`}
            </p>
          )}
        </Card>
      )}

      {gateway && seesStock && (
        <Card title="Low stock" description={`Tracked variants at or below ${lowStockThreshold} available. Source: ${gateway.sourceLabel}.`} testId="overview-low-stock">
          {lowStock.length === 0 ? (
            <p className="text-sm text-neutral-600">Nothing is at or below the threshold.</p>
          ) : (
            <ul className="divide-y divide-neutral-200 text-sm">
              {lowStock.slice(0, 12).map((row) => (
                <li key={`${row.inventoryItemId}:${row.locationId}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {row.productTitle} <span className="text-neutral-600">— {row.variantTitle}</span>
                  </span>
                  <Badge tone={row.available === 0 ? 'bad' : 'warn'}>{row.available === 0 ? 'Out of stock' : `${row.available} left`}</Badge>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs">
            <Link href="/admin/inventory?low=1" className="font-bold underline underline-offset-4">
              Open inventory ({lowStock.length})
            </Link>
          </p>
        </Card>
      )}

      <Card title="Audience and drops" description="Source: this application’s own records.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat testId="stat-optins" label="Newsletter opt-ins (30 days)" value={newOptIns} note={`${subscribers.filter((subscriber) => subscriber.status === 'subscribed').length} subscribed in total.`} />
          <Stat testId="stat-drops" label="Upcoming drops" value={upcoming.length} note={upcoming.length ? upcoming.map((drop) => drop.internalName).join(', ') : 'No drop is being teased.'} />
          <Stat testId="stat-tickets" label="Open inbox items" value={openTickets} />
        </div>
      </Card>
    </>
  );
}
