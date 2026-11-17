/**
 * Overview and analytics figures, derived only from orders the gateway returned.
 *
 * Every number here is arithmetic over real order records. Test orders and
 * cancelled orders are excluded from sales, and the result says how many were
 * excluded and whether the read was truncated, so a figure is never presented
 * as more complete than it is.
 */
import type { Money } from '@/domain/types';

import type { AdminOrder, OverviewMetrics } from './gateway';

const money = (amount: number, currency: string): Money => ({ amount, currency: currency === 'USD' ? 'USD' : 'CAD' });

export function computeOverview(
  orders: readonly AdminOrder[],
  range: { from: string; to: string },
  options: { source: string; truncated: boolean; newCustomers: number | null; includeTest?: boolean; currency?: string },
): OverviewMetrics {
  const currency = options.currency ?? orders[0]?.total.currency ?? 'CAD';
  const testOrders = options.includeTest ? [] : orders.filter((order) => order.test);
  const counted = orders.filter((order) => (options.includeTest || !order.test) && !order.status.cancelled);

  let gross = 0;
  let refunded = 0;
  let paid = 0;
  let awaiting = 0;
  const skus = new Map<string, { quantity: number; revenue: number }>();
  const codes = new Map<string, number>();

  for (const order of counted) {
    gross += order.total.amount;
    refunded += order.refunded.amount;
    if (order.status.payment === 'paid' || order.status.payment === 'partially_refunded') paid += 1;
    const payable = order.status.payment === 'paid' || order.status.payment === 'partially_refunded';
    if (payable && (order.status.fulfillment === 'unfulfilled' || order.status.fulfillment === 'partially_fulfilled')) {
      awaiting += 1;
    }
    for (const line of order.lines) {
      const label = line.sku ? `${line.sku} — ${line.title}` : [line.title, line.variantTitle].filter(Boolean).join(' / ');
      const entry = skus.get(label) ?? { quantity: 0, revenue: 0 };
      entry.quantity += line.quantity;
      entry.revenue += line.total.amount;
      skus.set(label, entry);
    }
    for (const code of order.discountCodes) codes.set(code, (codes.get(code) ?? 0) + 1);
  }

  return {
    from: range.from,
    to: range.to,
    currency,
    ordersCount: counted.length,
    paidOrders: paid,
    grossSales: money(gross, currency),
    netSales: money(gross - refunded, currency),
    averageOrderValue: counted.length ? money(Math.round(gross / counted.length), currency) : null,
    awaitingFulfillment: awaiting,
    newCustomers: options.newCustomers,
    topSkus: [...skus.entries()]
      .map(([label, entry]) => ({ label, quantity: entry.quantity, revenue: money(entry.revenue, currency) }))
      .sort((a, b) => b.quantity - a.quantity || b.revenue.amount - a.revenue.amount)
      .slice(0, 10),
    discountCodes: [...codes.entries()].map(([code, count]) => ({ code, orders: count })).sort((a, b) => b.orders - a.orders),
    truncated: options.truncated,
    testOrdersExcluded: testOrders.length,
    source: options.source,
  };
}

/** `YYYY-MM-DD` bounds for the last `days` days, inclusive of today (UTC). */
export function defaultRange(days = 30, now: Date = new Date()): { from: string; to: string } {
  const to = now.toISOString().slice(0, 10);
  const start = new Date(now.getTime() - (days - 1) * 86_400_000);
  return { from: start.toISOString().slice(0, 10), to };
}

export function parseRange(from: unknown, to: unknown): { from: string; to: string } {
  const valid = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const fallback = defaultRange();
  const range = { from: valid(from) ? from : fallback.from, to: valid(to) ? to : fallback.to };
  return range.from <= range.to ? range : fallback;
}
