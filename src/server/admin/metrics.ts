import 'server-only';

import { and, count, eq, gte, inArray } from 'drizzle-orm';

import { getDb } from '@/server/db/client';
import { communityPosts, drops, messages, promotions, subscribers, waitlistEntries } from '@/server/db/schema';
import { isAdminConfigured } from '@/server/shopify/config';
import { countOrders, listInventory, salesSummary } from '@/server/shopify/admin';

export interface ShopifyMetrics {
  readonly available: boolean;
  readonly error?: string;
  readonly revenue: number;
  readonly currency: string;
  readonly paidOrders: number;
  readonly averageOrderValue: number;
  readonly awaitingFulfilment: number;
  readonly lowStock: Array<{ product: string; variant: string; available: number; handle: string }>;
  readonly topSkus: Array<{ title: string; sku: string | null; quantity: number; revenue: number }>;
  readonly discountCodes: Array<{ code: string; orders: number }>;
  readonly refunded: number;
}

const PAID = new Set(['PAID', 'PARTIALLY_REFUNDED', 'PARTIALLY_PAID', 'REFUNDED']);

/** Sales metrics from real Shopify orders (test and cancelled orders excluded). */
export async function shopifyMetrics(days: number, lowStockThreshold: number): Promise<ShopifyMetrics> {
  const empty: ShopifyMetrics = { available: false, revenue: 0, currency: 'CAD', paidOrders: 0, averageOrderValue: 0, awaitingFulfilment: 0, lowStock: [], topSkus: [], discountCodes: [], refunded: 0 };
  if (!isAdminConfigured()) return empty;
  try {
    const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    const [orders, awaiting, inventory] = await Promise.all([
      salesSummary(since),
      countOrders('fulfillment_status:unfulfilled AND financial_status:paid AND status:open'),
      listInventory(null),
    ]);
    const real = orders.filter((order) => !order.test && !order.cancelledAt && PAID.has(order.displayFinancialStatus ?? ''));
    const revenue = real.reduce((sum, order) => sum + Number(order.totalPriceSet.shopMoney.amount), 0);
    const refunded = real.reduce((sum, order) => sum + Number(order.totalRefundedSet.shopMoney.amount), 0);
    const skus = new Map<string, { title: string; sku: string | null; quantity: number; revenue: number }>();
    const codes = new Map<string, number>();
    for (const order of real) {
      for (const code of order.discountCodes) codes.set(code, (codes.get(code) ?? 0) + 1);
      for (const item of order.lineItems.nodes) {
        const key = item.sku ?? item.title;
        const entry = skus.get(key) ?? { title: item.title, sku: item.sku, quantity: 0, revenue: 0 };
        entry.quantity += item.quantity;
        entry.revenue += Number(item.discountedTotalSet.shopMoney.amount);
        skus.set(key, entry);
      }
    }
    return {
      available: true,
      revenue,
      currency: real[0]?.totalPriceSet.shopMoney.currencyCode ?? 'CAD',
      paidOrders: real.length,
      averageOrderValue: real.length ? revenue / real.length : 0,
      awaitingFulfilment: awaiting,
      refunded,
      lowStock: inventory.rows
        .filter((row) => row.tracked)
        .flatMap((row) => row.levels.map((level) => ({ product: row.productTitle, variant: row.variantTitle, available: level.available, handle: row.productHandle })))
        .filter((entry) => entry.available <= lowStockThreshold)
        .sort((a, b) => a.available - b.available)
        .slice(0, 15),
      topSkus: [...skus.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10),
      discountCodes: [...codes.entries()].map(([code, orders]) => ({ code, orders })).sort((a, b) => b.orders - a.orders),
    };
  } catch (error) {
    return { ...empty, error: (error as Error).message };
  }
}

/** Counts from the app database — real records, no estimates. */
export async function appMetrics(days: number) {
  const db = await getDb();
  const since = new Date(Date.now() - days * 86_400_000);
  const one = async (query: Promise<Array<{ value: number }>>) => Number((await query)[0]?.value ?? 0);
  const [newSubscribers, totalSubscribed, waitlist, pendingCommunity, newMessages, draftPromotions, liveDrops] = await Promise.all([
    one(db.select({ value: count() }).from(subscribers).where(and(eq(subscribers.status, 'subscribed'), gte(subscribers.createdAt, since)))),
    one(db.select({ value: count() }).from(subscribers).where(eq(subscribers.status, 'subscribed'))),
    one(db.select({ value: count() }).from(waitlistEntries)),
    one(db.select({ value: count() }).from(communityPosts).where(eq(communityPosts.status, 'pending'))),
    one(db.select({ value: count() }).from(messages).where(eq(messages.status, 'new'))),
    one(db.select({ value: count() }).from(promotions).where(inArray(promotions.status, ['draft', 'approved']))),
    one(db.select({ value: count() }).from(drops).where(inArray(drops.status, ['coming_soon', 'early_access']))),
  ]);
  return { newSubscribers, totalSubscribed, waitlist, pendingCommunity, newMessages, draftPromotions, liveDrops };
}
