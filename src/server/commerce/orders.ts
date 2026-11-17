/**
 * Orders after payment: reading, fulfilling, cancelling and refunding.
 *
 * Status is always derived from facts recorded on the order — quantities
 * shipped, cents refunded, a cancellation timestamp. Nothing is set by hand,
 * and "delivered" is never implied: a fulfilment carries `delivered_at` only
 * when someone or something recorded the delivery.
 *
 * Money only leaves through `refundOrder`, which calls the payment provider
 * with an idempotency key and records the result against the order, so a
 * retried refund cannot pay out twice.
 */
import 'server-only';

import { and, desc, eq, gte, ilike, inArray, lte, or, sql } from 'drizzle-orm';

import { refundableCents } from '@/domain/pricing';

import { getDb, schema, type Executor } from '../db/client';
import { newId } from '../db/ids';

import { restock, shipStock, uncommitStock } from './inventory';
import { getPaymentProvider, PaymentsNotConfiguredError } from './payments';

const { orders, orderItems, fulfillments, payments, orderEvents } = schema;

export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type Fulfillment = typeof fulfillments.$inferSelect;
export type OrderEvent = typeof orderEvents.$inferSelect;

export interface OrderDetail {
  readonly order: Order;
  readonly items: OrderItem[];
  readonly fulfillments: Fulfillment[];
  readonly events: OrderEvent[];
  readonly payments: Array<typeof payments.$inferSelect>;
}

export class OrderError extends Error {
  constructor(
    message: string,
    readonly code: 'not_found' | 'invalid' | 'conflict',
  ) {
    super(message);
    this.name = 'OrderError';
  }
}

async function detail(executor: Executor, order: Order): Promise<OrderDetail> {
  const [items, shipped, events, money] = await Promise.all([
    executor.select().from(orderItems).where(eq(orderItems.orderId, order.id)),
    executor.select().from(fulfillments).where(eq(fulfillments.orderId, order.id)).orderBy(fulfillments.shippedAt),
    executor.select().from(orderEvents).where(eq(orderEvents.orderId, order.id)).orderBy(orderEvents.createdAt),
    executor.select().from(payments).where(eq(payments.orderId, order.id)).orderBy(payments.createdAt),
  ]);
  return { order, items, fulfillments: shipped, events, payments: money };
}

export async function getOrder(id: string): Promise<OrderDetail | null> {
  const db = await getDb();
  const [order] = await db.select().from(orders).where(eq(orders.id, id));
  return order ? detail(db, order) : null;
}

/**
 * An order as its customer may see it. The customer id is part of the WHERE
 * clause, so one customer can never load another's order by guessing an id.
 */
export async function getOrderForCustomer(customerId: string, orderId: string): Promise<OrderDetail | null> {
  const db = await getDb();
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.customerId, customerId)));
  return order ? detail(db, order) : null;
}

export async function listOrdersForCustomer(customerId: string): Promise<Order[]> {
  const db = await getDb();
  return db.select().from(orders).where(eq(orders.customerId, customerId)).orderBy(desc(orders.placedAt));
}

export interface OrderFilter {
  readonly search?: string;
  readonly payment?: string;
  readonly fulfillment?: string;
  readonly from?: Date;
  readonly to?: Date;
  readonly limit?: number;
}

export async function listOrders(filter: OrderFilter = {}): Promise<Order[]> {
  const db = await getDb();
  const term = filter.search?.trim();
  const conditions = [
    term
      ? or(ilike(orders.name, `%${term}%`), ilike(orders.email, `%${term}%`), sql`${orders.shippingAddress}::text ILIKE ${`%${term}%`}`)
      : undefined,
    filter.payment ? eq(orders.paymentStatus, filter.payment as Order['paymentStatus']) : undefined,
    filter.fulfillment ? eq(orders.fulfillmentStatus, filter.fulfillment as Order['fulfillmentStatus']) : undefined,
    filter.from ? gte(orders.placedAt, filter.from) : undefined,
    filter.to ? lte(orders.placedAt, filter.to) : undefined,
  ];
  return db
    .select()
    .from(orders)
    .where(and(...conditions))
    .orderBy(desc(orders.placedAt))
    .limit(Math.min(filter.limit ?? 100, 500));
}

const event = (orderId: string, type: string, message: string, actor: string) => ({
  id: newId('evt'),
  orderId,
  type,
  message,
  actor,
});

async function lockOrder(tx: Executor, id: string): Promise<Order> {
  const [order] = await tx.select().from(orders).where(eq(orders.id, id)).for('update');
  if (!order) throw new OrderError('Order not found.', 'not_found');
  return order;
}

/* ------------------------------------------------------------------ *
 * Fulfilment
 * ------------------------------------------------------------------ */

export interface FulfillInput {
  /** `{ orderItemId: quantity }`. Omit to ship everything still outstanding. */
  readonly items?: Readonly<Record<string, number>>;
  readonly trackingCompany?: string | null;
  readonly trackingNumber?: string | null;
  readonly trackingUrl?: string | null;
  readonly actor: string;
}

const safeTrackingUrl = (value: string | null | undefined): string | null =>
  value && /^https:\/\/[^\s"'<>]+$/i.test(value.trim()) ? value.trim().slice(0, 500) : null;

/**
 * Records a shipment. Takes the shipped units off the shelf, updates each
 * line's fulfilled quantity, and derives the order's fulfilment status.
 */
export async function fulfillOrder(orderId: string, input: FulfillInput): Promise<Fulfillment> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (order.cancelledAt) throw new OrderError('A cancelled order cannot be fulfilled.', 'conflict');
    if (order.paymentStatus === 'pending_payment') throw new OrderError('This order has not been paid.', 'conflict');
    if (order.paymentStatus === 'refunded') throw new OrderError('This order has been fully refunded.', 'conflict');

    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    const shipping: Record<string, number> = {};
    for (const item of items) {
      const outstanding = item.quantity - item.fulfilledQuantity;
      const requested = input.items ? (input.items[item.id] ?? 0) : outstanding;
      if (!Number.isInteger(requested) || requested < 0 || requested > outstanding) {
        throw new OrderError(`Cannot ship ${requested} of "${item.title}"; ${outstanding} outstanding.`, 'invalid');
      }
      if (requested > 0) shipping[item.id] = requested;
    }
    if (Object.keys(shipping).length === 0) throw new OrderError('There is nothing left to ship on this order.', 'conflict');

    for (const item of items) {
      const quantity = shipping[item.id];
      if (!quantity) continue;
      await tx
        .update(orderItems)
        .set({ fulfilledQuantity: item.fulfilledQuantity + quantity })
        .where(eq(orderItems.id, item.id));
    }
    await shipStock(
      tx,
      items
        .filter((item) => shipping[item.id] && item.variantId)
        .map((item) => ({ variantId: item.variantId!, quantity: shipping[item.id]! })),
      order.name,
      input.actor,
    );

    const [created] = await tx
      .insert(fulfillments)
      .values({
        id: newId('ful'),
        orderId,
        trackingCompany: input.trackingCompany?.trim().slice(0, 80) || null,
        trackingNumber: input.trackingNumber?.trim().slice(0, 80) || null,
        trackingUrl: safeTrackingUrl(input.trackingUrl),
        items: shipping,
        actor: input.actor,
      })
      .returning();

    const after = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    const allShipped = after.every((item) => item.fulfilledQuantity >= item.quantity);
    await tx
      .update(orders)
      .set({ fulfillmentStatus: allShipped ? 'fulfilled' : 'partially_fulfilled', updatedAt: new Date() })
      .where(eq(orders.id, orderId));

    const units = Object.values(shipping).reduce((total, quantity) => total + quantity, 0);
    await tx
      .insert(orderEvents)
      .values(
        event(
          orderId,
          'fulfilled',
          `Shipped ${units} item${units === 1 ? '' : 's'}${created!.trackingNumber ? ` — ${created!.trackingCompany ?? 'tracking'} ${created!.trackingNumber}` : ''}.`,
          input.actor,
        ),
      );
    return created!;
  });
}

/** Records that a shipment arrived. Only ever called on evidence. */
export async function markDelivered(fulfillmentId: string, actor: string): Promise<void> {
  const db = await getDb();
  await db.transaction(async (tx) => {
    const [shipment] = await tx.select().from(fulfillments).where(eq(fulfillments.id, fulfillmentId)).for('update');
    if (!shipment) throw new OrderError('Shipment not found.', 'not_found');
    if (shipment.deliveredAt) return;
    await tx.update(fulfillments).set({ deliveredAt: new Date() }).where(eq(fulfillments.id, fulfillmentId));
    await tx.insert(orderEvents).values(event(shipment.orderId, 'delivered', 'Shipment marked delivered.', actor));
  });
}

/* ------------------------------------------------------------------ *
 * Refunds and cancellation
 * ------------------------------------------------------------------ */

export interface RefundInput {
  readonly amountCents: number;
  readonly reason: string;
  /** `{ orderItemId: quantity }` returned to stock. Only shipped units can be restocked. */
  readonly restock?: Readonly<Record<string, number>>;
  readonly actor: string;
  /** Caller-chosen key; reusing it returns the first result instead of refunding again. */
  readonly idempotencyKey: string;
}

/**
 * Refunds part or all of an order through the payment provider.
 *
 * The provider is called before the database is updated, keyed by
 * `idempotencyKey`. If the process dies between the two, running the same
 * refund again returns the provider's original refund and the record is
 * written then — money is never returned twice and never goes unrecorded.
 */
export async function refundOrder(orderId: string, input: RefundInput): Promise<Order> {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new OrderError('Enter a refund amount greater than zero.', 'invalid');
  }
  const db = await getDb();
  const [current] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!current) throw new OrderError('Order not found.', 'not_found');
  if (current.source !== 'native' || !current.paymentRef) {
    throw new OrderError('This order was not paid through this platform, so it cannot be refunded from here.', 'conflict');
  }

  const providerRefId = `refund:${orderId}:${input.idempotencyKey}`;
  const [already] = await db.select().from(payments).where(eq(payments.providerRef, providerRefId));
  if (already) return current;

  if (input.amountCents > refundableCents(current.totalCents, current.refundedCents)) {
    throw new OrderError('That is more than the amount left to refund on this order.', 'invalid');
  }

  const provider = getPaymentProvider();
  if (!provider || provider.name !== current.paymentProvider) throw new PaymentsNotConfiguredError();
  await provider.refund({
    ref: current.paymentRef,
    amountCents: input.amountCents,
    idempotencyKey: providerRefId,
    reason: input.reason,
  });

  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    const inserted = await tx
      .insert(payments)
      .values({
        id: newId('pay'),
        orderId,
        kind: 'refund',
        provider: provider.name,
        providerRef: providerRefId,
        amountCents: input.amountCents,
        currency: order.currency,
        status: 'succeeded',
        reason: input.reason.slice(0, 500),
        actor: input.actor,
      })
      .onConflictDoNothing()
      .returning({ id: payments.id });
    if (inserted.length === 0) return order;

    const refundedCents = order.refundedCents + input.amountCents;
    const [updated] = await tx
      .update(orders)
      .set({
        refundedCents,
        paymentStatus: refundedCents >= order.totalCents ? 'refunded' : 'partially_refunded',
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId))
      .returning();

    if (input.restock) {
      const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
      const returning: Array<{ variantId: string; quantity: number }> = [];
      for (const item of items) {
        const quantity = input.restock[item.id] ?? 0;
        if (quantity <= 0) continue;
        if (!Number.isInteger(quantity) || quantity > item.fulfilledQuantity - item.refundedQuantity) {
          throw new OrderError(`Cannot restock ${quantity} of "${item.title}".`, 'invalid');
        }
        await tx
          .update(orderItems)
          .set({ refundedQuantity: item.refundedQuantity + quantity })
          .where(eq(orderItems.id, item.id));
        if (item.variantId) returning.push({ variantId: item.variantId, quantity });
      }
      await restock(tx, returning, order.name, input.actor);
    }

    await tx
      .insert(orderEvents)
      .values(
        event(orderId, 'refunded', `Refunded ${(input.amountCents / 100).toFixed(2)} ${order.currency}. ${input.reason}`.trim(), input.actor),
      );
    return updated!;
  });
}

/**
 * Cancels an order. Unshipped units go back on sale. If `refund` is true the
 * remaining paid amount is returned through the provider. An order with
 * shipped items cannot be cancelled — that is a return, handled by a refund.
 */
export async function cancelOrder(
  orderId: string,
  input: { reason: string; refund: boolean; actor: string },
): Promise<Order> {
  const db = await getDb();
  const cancelled = await db.transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (order.cancelledAt) return order;
    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    if (items.some((item) => item.fulfilledQuantity > 0)) {
      throw new OrderError('Items on this order have shipped. Refund the returned items instead of cancelling.', 'conflict');
    }
    if (order.source === 'native') {
      await uncommitStock(
        tx,
        items.filter((item) => item.variantId).map((item) => ({ variantId: item.variantId!, quantity: item.quantity })),
      );
    }
    const [updated] = await tx
      .update(orders)
      .set({ cancelledAt: new Date(), cancelReason: input.reason.slice(0, 500), updatedAt: new Date() })
      .where(eq(orders.id, orderId))
      .returning();
    await tx.insert(orderEvents).values(event(orderId, 'cancelled', `Order cancelled. ${input.reason}`.trim(), input.actor));
    return updated!;
  });

  const remaining = refundableCents(cancelled.totalCents, cancelled.refundedCents);
  if (input.refund && remaining > 0 && cancelled.paymentStatus !== 'pending_payment') {
    return refundOrder(orderId, {
      amountCents: remaining,
      reason: `Cancellation: ${input.reason}`,
      actor: input.actor,
      idempotencyKey: 'cancel',
    });
  }
  return cancelled;
}

export async function updateOrderNote(orderId: string, note: string, actor: string): Promise<void> {
  const db = await getDb();
  await db.transaction(async (tx) => {
    await lockOrder(tx, orderId);
    await tx.update(orders).set({ note: note.slice(0, 5000), updatedAt: new Date() }).where(eq(orders.id, orderId));
    await tx.insert(orderEvents).values(event(orderId, 'note', 'Internal note updated.', actor));
  });
}

/** Items for a set of orders, for list views that show item counts. */
export async function itemCounts(orderIds: readonly string[]): Promise<Map<string, number>> {
  if (orderIds.length === 0) return new Map();
  const db = await getDb();
  const rows = await db
    .select({ orderId: orderItems.orderId, count: sql<number>`sum(${orderItems.quantity})::int` })
    .from(orderItems)
    .where(inArray(orderItems.orderId, [...orderIds]))
    .groupBy(orderItems.orderId);
  return new Map(rows.map((row) => [row.orderId, row.count]));
}
