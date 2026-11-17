import 'server-only';

import { count, desc, eq } from 'drizzle-orm';

import {
  approvalProblems,
  promotionConfigSchema,
  seedPromotionDrafts,
  shopifyDiscountPlan,
  type PromotionConfig,
  type PromotionRecord,
  type PromotionStatus,
} from '@/domain/promotions';
import { audit, type AuditActor } from '@/server/audit';
import { getDb } from '@/server/db/client';
import { promotions } from '@/server/db/schema';
import { isAdminConfigured } from '@/server/shopify/config';
import {
  createDiscount,
  ensureFirstOrderSegment,
  resolveProductIdsByHandle,
  setDiscountActive,
} from '@/server/shopify/admin';

/**
 * Lifecycle:
 *   draft ──(owner approves, margin acknowledged)──► approved
 *   approved ──(owner publishes; Shopify discount created)──► live
 *   live ⇄ paused (Shopify discount deactivated / reactivated)
 *   any ──► ended
 *
 * A promotion only reaches shoppers when it is `live`, i.e. a real Shopify
 * discount exists — so the storefront never advertises an offer Shopify's
 * checkout will not honour.
 */

let seeded: Promise<void> | null = null;
function ensureSeed(): Promise<void> {
  seeded ??= (async () => {
    const db = await getDb();
    const [row] = await db.select({ value: count() }).from(promotions);
    if (Number(row?.value ?? 0) > 0) return;
    for (const draft of seedPromotionDrafts()) {
      await db.insert(promotions).values({
        name: draft.name,
        kind: draft.config.kind,
        status: 'draft',
        config: draft.config,
        createdBy: 'system',
      });
    }
  })().catch((error: unknown) => {
    seeded = null;
    throw error;
  });
  return seeded;
}

function toRecord(row: typeof promotions.$inferSelect): PromotionRecord & typeof row {
  const parsed = promotionConfigSchema.safeParse(row.config);
  return {
    ...row,
    status: row.status as PromotionStatus,
    config: (parsed.success ? parsed.data : row.config) as PromotionConfig,
  };
}

export async function listPromotions() {
  await ensureSeed();
  const db = await getDb();
  const rows = await db.select().from(promotions).orderBy(desc(promotions.updatedAt));
  return rows.map(toRecord);
}

export async function getPromotion(id: string) {
  await ensureSeed();
  const db = await getDb();
  const [row] = await db.select().from(promotions).where(eq(promotions.id, id)).limit(1);
  return row ? toRecord(row) : null;
}

/** Live promotions for storefront estimates. Never throws. */
export async function livePromotions(): Promise<PromotionRecord[]> {
  try {
    const db = await getDb();
    const rows = await db.select().from(promotions).where(eq(promotions.status, 'live'));
    return rows.map(toRecord);
  } catch {
    return [];
  }
}

export async function saveDraft(
  id: string | null,
  name: string,
  config: unknown,
  actor: AuditActor,
): Promise<string> {
  const parsed = promotionConfigSchema.parse(config);
  const db = await getDb();
  if (id) {
    const existing = await getPromotion(id);
    if (!existing) throw new Error('Promotion not found.');
    if (existing.status !== 'draft') {
      throw new Error(
        'Only drafts can be edited. End this promotion and create a new draft to change it.',
      );
    }
    await db
      .update(promotions)
      .set({
        name,
        kind: parsed.kind,
        config: parsed,
        marginAcknowledged: false,
        updatedAt: new Date(),
      })
      .where(eq(promotions.id, id));
    await audit({
      actor,
      action: 'promotion.update',
      summary: `Edited draft "${name}"`,
      targetType: 'promotion',
      targetId: id,
      metadata: parsed,
    });
    return id;
  }
  const [created] = await db
    .insert(promotions)
    .values({ name, kind: parsed.kind, status: 'draft', config: parsed, createdBy: actor.email })
    .returning({ id: promotions.id });
  await audit({
    actor,
    action: 'promotion.create',
    summary: `Created draft "${name}"`,
    targetType: 'promotion',
    targetId: created!.id,
    metadata: parsed,
  });
  return created!.id;
}

export async function approve(
  id: string,
  marginAcknowledged: boolean,
  actor: AuditActor,
): Promise<void> {
  const promotion = await getPromotion(id);
  if (!promotion) throw new Error('Promotion not found.');
  if (promotion.status !== 'draft') throw new Error('Only drafts can be approved.');
  const problems = approvalProblems(promotion.config, marginAcknowledged);
  if (problems.length) throw new Error(problems.join(' '));
  const db = await getDb();
  await db
    .update(promotions)
    .set({
      status: 'approved',
      marginAcknowledged: true,
      approvedBy: actor.email,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(promotions.id, id));
  await audit({
    actor,
    action: 'promotion.approve',
    summary: `Approved "${promotion.name}" (margin acknowledged)`,
    targetType: 'promotion',
    targetId: id,
  });
}

/** Creates the native Shopify discount. Requires the Admin API. */
export async function publish(id: string, actor: AuditActor): Promise<void> {
  const promotion = await getPromotion(id);
  if (!promotion) throw new Error('Promotion not found.');
  if (promotion.status !== 'approved')
    throw new Error('Approve the promotion before publishing it.');
  if (!isAdminConfigured()) {
    throw new Error(
      'Publishing creates a real Shopify discount and needs the Shopify Admin API (SHOPIFY_ADMIN_ACCESS_TOKEN with write_discounts). Nothing was changed.',
    );
  }
  const db = await getDb();
  try {
    const plan = shopifyDiscountPlan(promotion.config);
    const input = structuredClone(plan.input) as Record<string, unknown>;
    if (plan.productHandles.length) {
      const ids = await resolveProductIdsByHandle(plan.productHandles);
      // Replace handle lists with gids wherever the plan referenced products.
      const json = JSON.stringify(input);
      let replaced = json;
      plan.productHandles.forEach((handle, index) => {
        replaced = replaced.replaceAll(JSON.stringify(handle), JSON.stringify(ids[index]));
      });
      Object.assign(input, JSON.parse(replaced));
    }
    if (plan.needsFirstOrderSegment) {
      input.context = { customerSegments: { add: [await ensureFirstOrderSegment()] } };
    }
    const discountId = await createDiscount(plan.mutation, input);
    await db
      .update(promotions)
      .set({
        status: 'live',
        shopifyDiscountId: discountId,
        shopifySyncedAt: new Date(),
        shopifySyncError: null,
        updatedAt: new Date(),
      })
      .where(eq(promotions.id, id));
    await audit({
      actor,
      action: 'promotion.publish',
      summary: `Published "${promotion.name}" to Shopify`,
      targetType: 'promotion',
      targetId: id,
      metadata: { discountId },
    });
  } catch (error) {
    await db
      .update(promotions)
      .set({ shopifySyncError: (error as Error).message.slice(0, 500), updatedAt: new Date() })
      .where(eq(promotions.id, id));
    throw error;
  }
}

export async function setPaused(id: string, paused: boolean, actor: AuditActor): Promise<void> {
  const promotion = await getPromotion(id);
  if (!promotion?.shopifyDiscountId)
    throw new Error('This promotion has no Shopify discount to pause.');
  if (paused && promotion.status !== 'live') throw new Error('Only live promotions can be paused.');
  if (!paused && promotion.status !== 'paused')
    throw new Error('Only paused promotions can be resumed.');
  await setDiscountActive(promotion.shopifyDiscountId, !paused);
  const db = await getDb();
  await db
    .update(promotions)
    .set({ status: paused ? 'paused' : 'live', updatedAt: new Date() })
    .where(eq(promotions.id, id));
  await audit({
    actor,
    action: paused ? 'promotion.pause' : 'promotion.resume',
    summary: `${paused ? 'Paused' : 'Resumed'} "${promotion.name}"`,
    targetType: 'promotion',
    targetId: id,
  });
}

export async function end(id: string, actor: AuditActor): Promise<void> {
  const promotion = await getPromotion(id);
  if (!promotion) throw new Error('Promotion not found.');
  if (promotion.shopifyDiscountId && promotion.status === 'live') {
    await setDiscountActive(promotion.shopifyDiscountId, false);
  }
  const db = await getDb();
  await db
    .update(promotions)
    .set({ status: 'ended', updatedAt: new Date() })
    .where(eq(promotions.id, id));
  await audit({
    actor,
    action: 'promotion.end',
    summary: `Ended "${promotion.name}"`,
    targetType: 'promotion',
    targetId: id,
  });
}

export async function deleteDraft(id: string, actor: AuditActor): Promise<void> {
  const promotion = await getPromotion(id);
  if (!promotion) return;
  if (promotion.status !== 'draft')
    throw new Error('Only drafts can be deleted; end live promotions instead.');
  const db = await getDb();
  await db.delete(promotions).where(eq(promotions.id, id));
  await audit({
    actor,
    action: 'promotion.delete',
    summary: `Deleted draft "${promotion.name}"`,
    targetType: 'promotion',
    targetId: id,
  });
}
