/**
 * Audit log.
 *
 * Every admin mutation — and every refused one — is recorded with who did it,
 * what it touched and whether it succeeded. Entries are append-only from the
 * application's point of view: there is no update or delete path.
 *
 * `detail` must never contain a secret or a full customer record. Callers pass
 * identifiers and masked values (see `maskEmail`).
 */
import 'server-only';

import { getStore, newId } from './store';

export interface AuditEntry {
  readonly id: string;
  readonly at: string;
  readonly actor: string;
  readonly role: string;
  /** Dotted verb, e.g. `offer.activate`, `product.update`, `auth.login`. */
  readonly action: string;
  /** What was acted on, e.g. `offer:off_123`. */
  readonly target: string;
  readonly outcome: 'ok' | 'denied' | 'failed';
  readonly detail: string;
  readonly mode: 'native' | 'sandbox' | 'local';
}

export async function audit(entry: Omit<AuditEntry, 'id' | 'at'>): Promise<void> {
  const record: AuditEntry = { id: newId('aud'), at: new Date().toISOString(), ...entry, detail: entry.detail.slice(0, 500) };
  try {
    await getStore().put('audit', record.id, record);
  } catch (error) {
    // An audit failure must not take the action down with it, but it must be loud.
    console.error(`[audit] could not record ${record.action} on ${record.target}: ${(error as Error).message}`);
  }
}

export async function listAudit(limit = 200): Promise<AuditEntry[]> {
  const entries = await getStore().list<AuditEntry>('audit');
  return entries.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
