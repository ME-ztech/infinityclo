import 'server-only';

import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import { audit, type AuditActor } from '@/server/audit';
import { getDb } from '@/server/db/client';
import { drops, waitlistEntries } from '@/server/db/schema';

/**
 * Drop lifecycle: draft → coming_soon → early_access → published → sold_out → archived.
 * Only coming_soon and early_access drops appear on the storefront teaser; a
 * countdown appears only when the release time is marked confirmed.
 */
export const DROP_STATUSES = ['draft', 'coming_soon', 'early_access', 'published', 'sold_out', 'archived'] as const;
export type DropStatus = (typeof DROP_STATUSES)[number];
export const PUBLIC_TEASER_STATUSES: readonly DropStatus[] = ['coming_soon', 'early_access'];

export const dropInputSchema = z.object({
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,60}$/, 'Use lowercase letters, numbers and dashes.'),
  name: z.string().trim().min(2).max(80),
  status: z.enum(DROP_STATUSES),
  headline: z.string().trim().max(120).nullable(),
  body: z.string().trim().max(800).nullable(),
  mediaUrl: z.string().trim().max(600).nullable(),
  mediaAlt: z.string().trim().max(160).nullable(),
  releaseAt: z.string().nullable(),
  releaseConfirmed: z.boolean(),
  shopifyProductHandle: z.string().trim().max(200).nullable(),
  waitlistEnabled: z.boolean(),
});
export type DropInput = z.infer<typeof dropInputSchema>;

export async function listDrops() {
  const db = await getDb();
  const rows = await db.select().from(drops).orderBy(asc(drops.position), desc(drops.createdAt));
  const counts = await db
    .select({ dropId: waitlistEntries.dropId, value: count() })
    .from(waitlistEntries)
    .groupBy(waitlistEntries.dropId);
  const byDrop = new Map(counts.map((row) => [row.dropId, Number(row.value)]));
  return rows.map((row) => ({ ...row, waitlistCount: byDrop.get(row.id) ?? 0 }));
}

export async function publicTeasers() {
  try {
    const db = await getDb();
    return await db
      .select()
      .from(drops)
      .where(inArray(drops.status, [...PUBLIC_TEASER_STATUSES]))
      .orderBy(asc(drops.position), desc(drops.createdAt));
  } catch {
    return [];
  }
}

export async function getDropBySlug(slug: string) {
  const db = await getDb();
  const [row] = await db.select().from(drops).where(eq(drops.slug, slug)).limit(1);
  return row ?? null;
}

export async function saveDrop(id: string | null, input: DropInput, actor: AuditActor) {
  const parsed = dropInputSchema.parse(input);
  if (parsed.releaseConfirmed && !parsed.releaseAt) throw new Error('Set the release date before marking it confirmed.');
  const db = await getDb();
  const values = {
    ...parsed,
    releaseAt: parsed.releaseAt ? new Date(parsed.releaseAt) : null,
    updatedAt: new Date(),
  };
  if (id) {
    await db.update(drops).set(values).where(eq(drops.id, id));
    await audit({ actor, action: 'drop.update', summary: `Updated drop "${parsed.name}" (${parsed.status})`, targetType: 'drop', targetId: id });
    return id;
  }
  const [created] = await db.insert(drops).values(values).returning({ id: drops.id });
  await audit({ actor, action: 'drop.create', summary: `Created drop "${parsed.name}"`, targetType: 'drop', targetId: created!.id });
  return created!.id;
}

export const WAITLIST_CONSENT_TEXT = 'Email me when this drop releases. I can unsubscribe at any time.';

/** Returns false when the address was already on this drop's list (no duplicate rows). */
export async function joinWaitlist(input: { slug: string; email: string; ipHash: string | null }): Promise<'joined' | 'already' | 'closed'> {
  const drop = await getDropBySlug(input.slug);
  if (!drop || !drop.waitlistEnabled || !PUBLIC_TEASER_STATUSES.includes(drop.status as DropStatus)) return 'closed';
  const db = await getDb();
  const inserted = await db
    .insert(waitlistEntries)
    .values({ dropId: drop.id, email: input.email.trim().toLowerCase(), consentText: WAITLIST_CONSENT_TEXT, ipHash: input.ipHash })
    .onConflictDoNothing()
    .returning({ id: waitlistEntries.id });
  return inserted.length ? 'joined' : 'already';
}

export async function waitlistFor(dropId: string) {
  const db = await getDb();
  return db.select().from(waitlistEntries).where(and(eq(waitlistEntries.dropId, dropId))).orderBy(asc(waitlistEntries.createdAt));
}
