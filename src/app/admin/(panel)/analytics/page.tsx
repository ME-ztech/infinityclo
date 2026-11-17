import type { Metadata } from 'next';

import { Button, Card, Disconnected, Empty, Flash, PageHeader, Stat, TableWrap, formatMoney, inputClass, td, th } from '@/components/admin/ui';
import { REQUIRED_ADMIN_SCOPES, getGateway, type OverviewMetrics } from '@/server/admin/gateway';
import { parseRange } from '@/server/admin/metrics';
import { param, requirePage, type SearchParams } from '@/server/admin/page';
import { listOffers } from '@/server/offers';

export const metadata: Metadata = { title: 'Analytics' };

export default async function AdminAnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePage('analytics.view');
  const params = await searchParams;
  const range = parseRange(param(params, 'from'), param(params, 'to'));
  const gateway = await getGateway();

  let metrics: OverviewMetrics | null = null;
  let error: string | null = null;
  if (gateway) {
    try {
      metrics = await gateway.overview(range);
    } catch (caught) {
      error = (caught as Error).message;
    }
  }
  const offers = await listOffers();
  const liveOffers = offers.filter((offer) => offer.status === 'live' && !offer.sandbox).length;

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Figures computed from this store’s own orders. Each one names where it comes from; nothing is estimated or projected."
      />
      <Flash params={params} />

      <form method="get" className="mb-6 flex flex-wrap items-end gap-3" aria-label="Date range">
        <div>
          <label htmlFor="from" className="mb-1 block text-xs font-semibold uppercase">From</label>
          <input id="from" name="from" type="date" defaultValue={range.from} className={inputClass} />
        </div>
        <div>
          <label htmlFor="to" className="mb-1 block text-xs font-semibold uppercase">To</label>
          <input id="to" name="to" type="date" defaultValue={range.to} className={inputClass} />
        </div>
        <Button variant="secondary">Apply</Button>
        <p className="text-xs text-neutral-600">Dates are UTC days, inclusive.</p>
      </form>

      {!gateway && <Disconnected module="Analytics" scopes={REQUIRED_ADMIN_SCOPES} />}
      {error && <p role="alert" className="mb-4 border border-red-700 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</p>}

      {metrics && (
        <>
          <Card title="Sales" description={`Source: ${metrics.source}. Currency: ${metrics.currency}. ${metrics.testOrdersExcluded} test order${metrics.testOrdersExcluded === 1 ? '' : 's'} excluded.`} testId="analytics-sales">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Orders" value={metrics.ordersCount} note="Cancelled orders are not counted." testId="analytics-orders" />
              <Stat label="Gross sales" value={formatMoney(metrics.grossSales)} note="Order totals, including shipping and tax." />
              <Stat label="Net sales" value={formatMoney(metrics.netSales)} note="Gross less refunds." />
              <Stat label="Average order" value={formatMoney(metrics.averageOrderValue)} note="Gross sales ÷ orders." />
            </div>
            {metrics.truncated && (
              <p role="status" className="mt-3 text-xs text-amber-900">
                This range held more orders than were read, so these figures are a minimum. Narrow the dates.
              </p>
            )}
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Top items" description="By units sold in this range.">
              {metrics.topSkus.length === 0 ? (
                <Empty title="No sales in this range" />
              ) : (
                <TableWrap label="Top items">
                  <thead>
                    <tr>
                      <th className={th}>Item</th>
                      <th className={th}>Units</th>
                      <th className={th}>Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.topSkus.map((sku) => (
                      <tr key={sku.label}>
                        <td className={td}>{sku.label}</td>
                        <td className={`${td} tabular-nums`}>{sku.quantity}</td>
                        <td className={`${td} tabular-nums`}>{formatMoney(sku.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
              )}
            </Card>

            <Card title="Promotions" description={`${liveOffers} offer${liveOffers === 1 ? '' : 's'} live right now. Orders in this range that used a code:`}>
              {metrics.discountCodes.length === 0 ? (
                <Empty title="No codes used in this range" />
              ) : (
                <TableWrap label="Discount codes used">
                  <thead>
                    <tr>
                      <th className={th}>Code</th>
                      <th className={th}>Orders</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.discountCodes.map((code) => (
                      <tr key={code.code}>
                        <td className={`${td} font-mono`}>{code.code}</td>
                        <td className={`${td} tabular-nums`}>{code.orders}</td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
              )}
            </Card>
          </div>
        </>
      )}

      <Card title="Not measured" description="Stated rather than left blank, so an empty tile is never mistaken for zero.">
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-neutral-800" data-testid="analytics-not-measured">
          <li>
            <strong>Sessions, visitors and conversion rate: not instrumented.</strong> No analytics tag is installed on the
            storefront, so there is no visit count to divide orders by. Adding one is a deliberate decision that also needs
            a cookie-consent notice.
          </li>
          <li>
            <strong>Campaign (UTM) attribution: not recorded.</strong> Orders do not yet store the link a customer arrived
            from.
          </li>
          <li>
            <strong>Returns</strong> appear above only as refunded amounts inside net sales; there is no separate returns
            report yet.
          </li>
        </ul>
      </Card>
    </>
  );
}
