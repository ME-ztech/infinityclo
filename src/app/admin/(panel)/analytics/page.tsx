import { AdminPage, Badge, Card, formatCad, Stat, Table, Td } from '@/components/admin/ui';
import { requireStaffPage } from '@/server/auth/staff';
import { appMetrics, shopifyMetrics } from '@/server/admin/metrics';
import { getSettings } from '@/server/content/cms';

export const metadata = { title: 'Analytics' };

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  await requireStaffPage('analytics:read', '/admin/analytics');
  const { days: raw } = await searchParams;
  const days = [7, 30, 90].includes(Number(raw)) ? Number(raw) : 30;
  const settings = await getSettings();
  const [shop, app] = await Promise.all([
    shopifyMetrics(days, settings.lowStockThreshold),
    appMetrics(days),
  ]);
  return (
    <AdminPage
      title="Analytics"
      description={`Last ${days} days. Each figure names its source. Nothing is estimated.`}
    >
      <div className="flex gap-2 text-sm">
        {[7, 30, 90].map((value) => (
          <a
            key={value}
            href={`/admin/analytics?days=${value}`}
            className={
              value === days
                ? 'bg-ink text-paper px-3 py-1.5'
                : 'border-line border bg-white px-3 py-1.5'
            }
          >
            {value} days
          </a>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Revenue · Shopify"
          value={shop.available ? formatCad(shop.revenue, shop.currency) : 'Unavailable'}
        />
        <Stat
          label="Paid orders · Shopify"
          value={shop.available ? shop.paidOrders : 'Unavailable'}
        />
        <Stat
          label="AOV · Shopify"
          value={shop.available ? formatCad(shop.averageOrderValue, shop.currency) : 'Unavailable'}
        />
        <Stat
          label="Refunded · Shopify"
          value={shop.available ? formatCad(shop.refunded, shop.currency) : 'Unavailable'}
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Top products by revenue · Shopify">
          {shop.available ? (
            <Table head={['Product', 'SKU', 'Units', 'Revenue']}>
              {shop.topSkus.map((sku) => (
                <tr key={`${sku.title}-${sku.sku}`}>
                  <Td>{sku.title}</Td>
                  <Td>{sku.sku ?? '—'}</Td>
                  <Td>{sku.quantity}</Td>
                  <Td>{formatCad(sku.revenue)}</Td>
                </tr>
              ))}
            </Table>
          ) : (
            <p className="text-sm text-neutral-600">
              Connect the Admin API (read_orders) to see sales by product.
            </p>
          )}
        </Card>
        <Card title="Discount codes used · Shopify">
          {shop.available ? (
            shop.discountCodes.length ? (
              <ul className="text-sm">
                {shop.discountCodes.map((code) => (
                  <li key={code.code}>
                    {code.code}: {code.orders} orders
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-neutral-600">No discount codes used in this period.</p>
            )
          ) : (
            <p className="text-sm text-neutral-600">
              Unavailable until the Admin API is connected.
            </p>
          )}
        </Card>
        <Card title="Sessions, conversion & campaign UTMs">
          <Badge tone="warn">Not instrumented</Badge>
          <p className="mt-2 text-sm text-neutral-600">
            This storefront does not run a tracking script, so it has no session or conversion data
            to show. Shopify Analytics reports checkout-side sessions and UTM attribution for
            orders. Adding GA4 or Meta Pixel requires a consent banner first (Settings →
            Integrations notes).
          </p>
        </Card>
        <Card title="Community & email · app database">
          <ul className="text-sm">
            <li>New newsletter opt-ins: {app.newSubscribers}</li>
            <li>Total subscribed: {app.totalSubscribed}</li>
            <li>Waitlist sign-ups (all time): {app.waitlist}</li>
            <li>Community posts awaiting review: {app.pendingCommunity}</li>
          </ul>
        </Card>
      </div>
    </AdminPage>
  );
}
