import 'server-only';

import { desc } from 'drizzle-orm';

import { getDb } from '@/server/db/client';
import { auditLog } from '@/server/db/schema';

export interface AuditActor {
  readonly id: string | null;
  readonly email: string | null;
}

export interface AuditEntry {
  readonly actor: AuditActor | null;
  readonly action: string;
  readonly summary: string;
  readonly targetType?: string;
  readonly targetId?: string;
  readonly metadata?: Record<string, unknown>;
  readonly ipHash?: string | null;
}

const SECRET_KEYS = /(password|token|secret|authorization|cookie|card|cvv|hash)/i;

/** Removes anything secret-shaped from audit metadata before it is stored. */
export function maskMetadata(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[depth]';
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => maskMetadata(item, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, inner]) => [
        key,
        SECRET_KEYS.test(key) ? '[redacted]' : maskMetadata(inner, depth + 1),
      ]),
    );
  }
  if (typeof value === 'string' && value.length > 500) return `${value.slice(0, 500)}…`;
  return value;
}

type Inserter = Pick<Awaited<ReturnType<typeof getDb>>, 'insert'>;

/**
 * Writes an audit entry. Pass `executor` (a transaction) when auditing inside a
 * transaction so the entry commits or rolls back with the change it describes.
 */
export async function audit(entry: AuditEntry, executor?: Inserter): Promise<void> {
  const db = executor ?? (await getDb());
  await db.insert(auditLog).values({
    actorId: entry.actor?.id ?? null,
    actorEmail: entry.actor?.email ?? null,
    action: entry.action,
    summary: entry.summary,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    metadata: entry.metadata ? (maskMetadata(entry.metadata) as Record<string, unknown>) : null,
    ipHash: entry.ipHash ?? null,
  });
}

export async function recentAudit(limit = 100) {
  const db = await getDb();
  return db.select().from(auditLog).orderBy(desc(auditLog.at)).limit(limit);
}
