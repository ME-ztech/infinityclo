import Link from 'next/link';

import { AdminPage, Badge, Card, formatCad, Stat } from '@/components/admin/ui';
import { requireStaffPage } from '@/server/auth/staff';
import { appMetrics, shopifyMetrics } from '@/server/admin/metrics';
import { getSettings } from '@/server/content/cms';
import { integrationStatuses } from '@/server/shopify/config';

export const metadata = { title: 'Overview' };

export default async function OverviewPage() {
  await requireStaffPage('overview:read', '/admin');
  const settings = await getSettings();
  const [shop, app] = await Promise.all([shopifyMetrics(30, settings.lowStockThreshold), appMetrics(30)]);
  return (
    <AdminPage title="Overview" description="Last 30 days. Sales figures come from Shopify orders (test and cancelled orders excluded); community, inbox and email figures come from this app’s database.">
      <section aria-label="Sales">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase">
          Sales · Shopify {shop.available ? <Badge tone="good">Live</Badge> : <Badge tone="warn">Not connected</Badge>}
        </h2>
        {shop.error && <p className="text-signal mb-3 text-sm">Shopify error: {shop.error}</p>}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Confirmed revenue (CAD)" value={shop.available ? formatCad(shop.revenue, shop.currency) : '—'} hint={shop.available ? 'Paid orders, last 30 days' : 'Connect the Admin API'} />
          <Stat label="Paid orders" value={shop.available ? shop.paidOrders : '—'} href="/admin/orders" />
          <Stat label="Awaiting fulfilment" value={shop.available ? shop.awaitingFulfilment : '—'} href="/admin/orders?status=unfulfilled" />
          <Stat label="Average order value" value={shop.available ? formatCad(shop.averageOrderValue, shop.currency) : '—'} />
        </div>
      </section>

      <section aria-label="Community and marketing">
        <h2 className="mb-3 text-sm font-semibold uppercase">Community & marketing · app database</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="New newsletter opt-ins" value={app.newSubscribers} hint={`${app.totalSubscribed} subscribed in total`} href="/admin/marketing" />
          <Stat label="Waitlist sign-ups" value={app.waitlist} hint={`${app.liveDrops} drop(s) teased`} href="/admin/drops" />
          <Stat label="Community to review" value={app.pendingCommunity} href="/admin/community" />
          <Stat label="New messages" value={app.newMessages} href="/admin/messages" />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Low stock" actions={<Link href="/admin/inventory" className="text-sm underline">Inventory</Link>}>
          {!shop.available ? (
            <p className="text-sm text-neutral-600">Stock counts live in Shopify; connect the Admin API to see them here.</p>
          ) : shop.lowStock.length === 0 ? (
            <p className="text-sm text-neutral-600">Nothing at or below {settings.lowStockThreshold} units.</p>
          ) : (
            <ul className="divide-line divide-y text-sm">
              {shop.lowStock.map((item) => (
                <li key={`${item.handle}-${item.variant}`} className="flex justify-between py-2">
                  <span>
                    {item.product} — {item.variant}
                  </span>
                  <span className={item.available <= 0 ? 'text-signal font-semibold' : ''}>{item.available}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="To do">
          <ul className="flex flex-col gap-2 text-sm">
            {app.draftPromotions > 0 && (
              <li>
                <Link href="/admin/promotions" className="underline">{app.draftPromotions} promotion(s)</Link> waiting for owner decision — none are live.
              </li>
            )}
            {integrationStatuses()
              .filter((status) => !status.configured)
              .map((status) => (
                <li key={status.key}>
                  <Link href="/admin/settings#integrations" className="underline">{status.label}</Link> not connected — {status.unlocks}
                </li>
              ))}
          </ul>
        </Card>
      </div>
    </AdminPage>
  );
}
