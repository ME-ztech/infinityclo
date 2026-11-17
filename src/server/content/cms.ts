import 'server-only';

import { eq } from 'drizzle-orm';

import { CMS_DOCUMENTS, parseCms, type CmsKey, type CmsValue } from '@/domain/cms';
import { DEFAULT_SETTINGS, storeSettingsSchema, type StoreSettings } from '@/domain/settings';
import { audit, type AuditActor } from '@/server/audit';
import { getDb } from '@/server/db/client';
import { cmsDocuments, settings } from '@/server/db/schema';

/**
 * Reads never throw: if the database is unreachable or a stored document fails
 * validation, the storefront renders the defaults instead of an error page.
 */
export async function getCms<K extends CmsKey>(
  key: K,
): Promise<{ value: CmsValue<K>; version: number; stored: boolean }> {
  try {
    const db = await getDb();
    const [row] = await db.select().from(cmsDocuments).where(eq(cmsDocuments.key, key)).limit(1);
    if (!row)
      return { value: CMS_DOCUMENTS[key].defaults as CmsValue<K>, version: 0, stored: false };
    const parsed = parseCms(key, row.data);
    return { value: parsed.value, version: row.version, stored: parsed.valid };
  } catch (error) {
    if (process.env.NEXT_PHASE !== 'phase-production-build')
      console.error(`[cms] falling back to defaults for "${key}": ${(error as Error).message}`);
    return { value: CMS_DOCUMENTS[key].defaults as CmsValue<K>, version: 0, stored: false };
  }
}

export class VersionConflictError extends Error {
  constructor() {
    super(
      'Someone else saved this content after you opened it. Reload to see their changes, then edit again.',
    );
    this.name = 'VersionConflictError';
  }
}

/** Validates and saves a document. `expectedVersion` prevents silently overwriting a colleague's edit. */
export async function saveCms<K extends CmsKey>(
  key: K,
  input: unknown,
  expectedVersion: number,
  actor: AuditActor,
): Promise<{ version: number }> {
  const parsed = CMS_DOCUMENTS[key].schema.parse(input);
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(cmsDocuments)
      .where(eq(cmsDocuments.key, key))
      .limit(1);
    const currentVersion = current?.version ?? 0;
    if (currentVersion !== expectedVersion) throw new VersionConflictError();
    const version = currentVersion + 1;
    if (current) {
      await tx
        .update(cmsDocuments)
        .set({ data: parsed, version, updatedAt: new Date(), updatedBy: actor.email })
        .where(eq(cmsDocuments.key, key));
    } else {
      await tx.insert(cmsDocuments).values({ key, data: parsed, version, updatedBy: actor.email });
    }
    await audit(
      {
        actor,
        action: 'cms.save',
        summary: `Updated ${CMS_DOCUMENTS[key].label} (v${version})`,
        targetType: 'cms',
        targetId: key,
      },
      tx,
    );
    return { version };
  });
}

/* ------------------------------------------------------------------ *
 * Settings
 * ------------------------------------------------------------------ */

export async function getSettings(): Promise<StoreSettings> {
  try {
    const db = await getDb();
    const [row] = await db.select().from(settings).where(eq(settings.key, 'store')).limit(1);
    if (!row) return DEFAULT_SETTINGS;
    const parsed = storeSettingsSchema.safeParse({ ...DEFAULT_SETTINGS, ...(row.value as object) });
    return parsed.success ? parsed.data : DEFAULT_SETTINGS;
  } catch (error) {
    if (process.env.NEXT_PHASE !== 'phase-production-build')
      console.error(`[settings] falling back to defaults: ${(error as Error).message}`);
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(input: unknown, actor: AuditActor): Promise<StoreSettings> {
  const parsed = storeSettingsSchema.parse(input);
  const db = await getDb();
  await db
    .insert(settings)
    .values({ key: 'store', value: parsed, updatedBy: actor.email })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: parsed, updatedAt: new Date(), updatedBy: actor.email },
    });
  await audit({
    actor,
    action: 'settings.save',
    summary: 'Updated store settings',
    targetType: 'settings',
    targetId: 'store',
    metadata: parsed,
  });
  return parsed;
}
