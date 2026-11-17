/**
 * Inventory.
 *
 * Two counters per variant: `on_hand` (physically in stock) and `reserved`
 * (promised to an open checkout or a paid, unshipped order). What a customer
 * can buy is `on_hand − reserved`.
 *
 * Every change is a single conditional UPDATE — the guard is in the WHERE
 * clause, so the database decides who gets the last unit and two concurrent
 * checkouts cannot both succeed. Every change to `on_hand` also appends a row
 * to `inventory_movements`, so stock is always explainable.
 *
 * Lifecycle of a unit:
 *
 *   reserve   checkout opens          reserved +n
 *   release   checkout expires/fails  reserved −n
 *   commit    payment confirmed       (stays reserved; reservation → committed)
 *   ship      order fulfilled         on_hand −n, reserved −n, movement "sale"
 *   cancel    paid order cancelled    reserved −n (never left the shelf)
 */
import 'server-only';

import { and, eq, inArray, lt, sql } from 'drizzle-orm';

import { getDb, schema, type Executor } from '../db/client';
import { newId } from '../db/ids';

const { inventoryLevels, inventoryMovements, inventoryReservations, productVariants, products } = schema;

export class InsufficientStockError extends Error {
  constructor(readonly variantId: string) {
    super('That item just sold out or there are not enough left.');
    this.name = 'InsufficientStockError';
  }
}

export class StockConflictError extends Error {
  constructor() {
    super('Stock changed since this page was loaded. Reload to see the current quantity, then try again.');
    this.name = 'StockConflictError';
  }
}

export type MovementReason = (typeof schema.inventoryReason.enumValues)[number];

/**
 * Holds stock for a checkout. All-or-nothing: run inside a transaction and it
 * throws `InsufficientStockError` for the first line that cannot be covered,
 * rolling back the lines already taken.
 */
export async function reserveStock(
  tx: Executor,
  checkoutId: string,
  lines: ReadonlyArray<{ variantId: string; quantity: number }>,
  expiresAt: Date,
): Promise<void> {
  for (const line of lines) {
    const updated = await tx
      .update(inventoryLevels)
      .set({ reserved: sql`${inventoryLevels.reserved} + ${line.quantity}`, updatedAt: new Date() })
      .where(
        and(
          eq(inventoryLevels.variantId, line.variantId),
          // Untracked and pre-order variants are not limited by the shelf.
          sql`(${inventoryLevels.tracked} = false
               OR ${inventoryLevels.onHand} - ${inventoryLevels.reserved} >= ${line.quantity}
               OR EXISTS (
                    SELECT 1 FROM ${productVariants}
                    JOIN ${products} ON ${products.id} = ${productVariants.productId}
                    WHERE ${productVariants.id} = ${inventoryLevels.variantId} AND ${products.preorder} = true))`,
        ),
      )
      .returning({ variantId: inventoryLevels.variantId });
    if (updated.length === 0) throw new InsufficientStockError(line.variantId);

    await tx.insert(inventoryReservations).values({
      id: newId('rsv'),
      checkoutId,
      variantId: line.variantId,
      quantity: line.quantity,
      expiresAt,
    });
  }
}

/** Returns a checkout's active reservations to the shelf. Safe to call twice. */
export async function releaseReservations(tx: Executor, checkoutId: string): Promise<number> {
  const released = await tx
    .update(inventoryReservations)
    .set({ status: 'released', updatedAt: new Date() })
    .where(and(eq(inventoryReservations.checkoutId, checkoutId), eq(inventoryReservations.status, 'active')))
    .returning({ variantId: inventoryReservations.variantId, quantity: inventoryReservations.quantity });
  for (const row of released) {
    await tx
      .update(inventoryLevels)
      .set({ reserved: sql`GREATEST(0, ${inventoryLevels.reserved} - ${row.quantity})`, updatedAt: new Date() })
      .where(eq(inventoryLevels.variantId, row.variantId));
  }
  return released.length;
}

/**
 * Payment confirmed: the hold becomes a commitment to the order. If the hold
 * had already expired and been released (a very slow payment), the stock is
 * taken again — and if it is no longer there, the caller is told so the order
 * can be flagged for staff rather than silently oversold.
 */
export async function commitReservations(
  tx: Executor,
  checkoutId: string,
  lines: ReadonlyArray<{ variantId: string; quantity: number }>,
): Promise<{ oversold: string[] }> {
  const committed = await tx
    .update(inventoryReservations)
    .set({ status: 'committed', updatedAt: new Date() })
    .where(and(eq(inventoryReservations.checkoutId, checkoutId), eq(inventoryReservations.status, 'active')))
    .returning({ variantId: inventoryReservations.variantId });
  const held = new Set(committed.map((row) => row.variantId));

  const oversold: string[] = [];
  for (const line of lines) {
    if (held.has(line.variantId)) continue;
    // The hold lapsed. The customer has paid, so the stock is committed
    // regardless; `oversold` reports any line the shelf can no longer cover.
    const [level] = await tx
      .update(inventoryLevels)
      .set({ reserved: sql`${inventoryLevels.reserved} + ${line.quantity}`, updatedAt: new Date() })
      .where(eq(inventoryLevels.variantId, line.variantId))
      .returning({ onHand: inventoryLevels.onHand, reserved: inventoryLevels.reserved, tracked: inventoryLevels.tracked });
    if (level && level.tracked && level.reserved > level.onHand) oversold.push(line.variantId);
    await tx
      .update(inventoryReservations)
      .set({ status: 'committed', updatedAt: new Date() })
      .where(and(eq(inventoryReservations.checkoutId, checkoutId), eq(inventoryReservations.variantId, line.variantId)));
  }
  return { oversold };
}

/** Goods left the building: take them off the shelf and out of `reserved`. */
export async function shipStock(
  tx: Executor,
  lines: ReadonlyArray<{ variantId: string; quantity: number }>,
  reference: string,
  actor: string,
): Promise<void> {
  for (const line of lines) {
    const [level] = await tx
      .update(inventoryLevels)
      .set({
        onHand: sql`GREATEST(0, ${inventoryLevels.onHand} - ${line.quantity})`,
        reserved: sql`GREATEST(0, ${inventoryLevels.reserved} - ${line.quantity})`,
        updatedAt: new Date(),
      })
      .where(eq(inventoryLevels.variantId, line.variantId))
      .returning({ onHand: inventoryLevels.onHand });
    if (!level) continue;
    await tx.insert(inventoryMovements).values({
      id: newId('mov'),
      variantId: line.variantId,
      delta: -line.quantity,
      onHandAfter: level.onHand,
      reason: 'sale',
      reference,
      actor,
    });
  }
}

/** A paid, unshipped line was cancelled: free the commitment. */
export async function uncommitStock(
  tx: Executor,
  lines: ReadonlyArray<{ variantId: string; quantity: number }>,
): Promise<void> {
  for (const line of lines) {
    await tx
      .update(inventoryLevels)
      .set({ reserved: sql`GREATEST(0, ${inventoryLevels.reserved} - ${line.quantity})`, updatedAt: new Date() })
      .where(eq(inventoryLevels.variantId, line.variantId));
  }
}

/** Returned goods go back on the shelf, with a ledger entry. */
export async function restock(
  tx: Executor,
  lines: ReadonlyArray<{ variantId: string; quantity: number }>,
  reference: string,
  actor: string,
): Promise<void> {
  for (const line of lines) {
    const [level] = await tx
      .update(inventoryLevels)
      .set({ onHand: sql`${inventoryLevels.onHand} + ${line.quantity}`, updatedAt: new Date() })
      .where(eq(inventoryLevels.variantId, line.variantId))
      .returning({ onHand: inventoryLevels.onHand });
    if (!level) continue;
    await tx.insert(inventoryMovements).values({
      id: newId('mov'),
      variantId: line.variantId,
      delta: line.quantity,
      onHandAfter: level.onHand,
      reason: 'restock',
      reference,
      actor,
    });
  }
}

/**
 * Staff sets the on-hand count. Compare-and-set: the write only lands if the
 * count is still what the operator was looking at, so a sale that happened in
 * between is never overwritten.
 */
export async function setOnHand(input: {
  variantId: string;
  quantity: number;
  expectedQuantity: number;
  reason: MovementReason;
  actor: string;
  reference?: string;
}): Promise<void> {
  if (!Number.isInteger(input.quantity) || input.quantity < 0 || input.quantity > 1_000_000) {
    throw new Error('Quantity must be a whole number between 0 and 1,000,000.');
  }
  const db = await getDb();
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(inventoryLevels)
      .set({ onHand: input.quantity, updatedAt: new Date() })
      .where(and(eq(inventoryLevels.variantId, input.variantId), eq(inventoryLevels.onHand, input.expectedQuantity)))
      .returning({ onHand: inventoryLevels.onHand });
    if (updated.length === 0) throw new StockConflictError();
    if (input.quantity !== input.expectedQuantity) {
      await tx.insert(inventoryMovements).values({
        id: newId('mov'),
        variantId: input.variantId,
        delta: input.quantity - input.expectedQuantity,
        onHandAfter: input.quantity,
        reason: input.reason,
        reference: input.reference ?? '',
        actor: input.actor,
      });
    }
  });
}

/**
 * Releases the holds of checkouts whose time ran out. Called opportunistically
 * whenever a checkout is created and by the scheduled maintenance route, so
 * abandoned checkouts cannot lock stock indefinitely even with no job runner.
 */
export async function releaseExpiredReservations(now: Date = new Date()): Promise<number> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const expired = await tx
      .selectDistinct({ checkoutId: inventoryReservations.checkoutId })
      .from(inventoryReservations)
      .where(and(eq(inventoryReservations.status, 'active'), lt(inventoryReservations.expiresAt, now)));
    let released = 0;
    for (const row of expired) released += await releaseReservations(tx, row.checkoutId);
    if (expired.length > 0) {
      await tx
        .update(schema.checkouts)
        .set({ status: 'expired', updatedAt: now })
        .where(
          and(
            inArray(
              schema.checkouts.id,
              expired.map((row) => row.checkoutId),
            ),
            eq(schema.checkouts.status, 'open'),
          ),
        );
    }
    return released;
  });
}

export async function availableQuantity(executor: Executor, variantId: string): Promise<number | null> {
  const [level] = await executor.select().from(inventoryLevels).where(eq(inventoryLevels.variantId, variantId));
  if (!level) return 0;
  return level.tracked ? Math.max(0, level.onHand - level.reserved) : null;
}
