/**
 * Guard for CSV export routes.
 *
 * Exports are plain GET downloads, so they do not pass through `runAction`.
 * They get the same treatment by hand: the session and permission are checked
 * on the server, and every export — allowed or refused — is written to the
 * audit log, because an export is how personal data leaves the system.
 */
import 'server-only';

import { audit } from '../audit';

import { AdminAuthError, requirePermission, type AdminSession } from './auth';
import { gatewayMode } from './gateway';
import type { Permission } from './permissions';

export async function guardExport(
  permission: Permission,
  what: string,
): Promise<{ session: AdminSession; refused: null } | { session: null; refused: Response }> {
  try {
    const session = await requirePermission(permission, `export:${what}`);
    return { session, refused: null };
  } catch (error) {
    if (error instanceof AdminAuthError) {
      const status = error.reason === 'unauthenticated' ? 401 : 403;
      return { session: null, refused: new Response(error.message, { status, headers: { 'cache-control': 'no-store' } }) };
    }
    throw error;
  }
}

export async function auditExport(session: AdminSession, what: string, rows: number, commerce = false): Promise<void> {
  await audit({
    actor: session.email,
    role: session.role,
    action: 'export.csv',
    target: `export:${what}`,
    outcome: 'ok',
    detail: `Exported ${rows} ${what} row${rows === 1 ? '' : 's'}.`,
    mode: commerce ? (gatewayMode() === 'sandbox' ? 'sandbox' : 'native') : 'local',
  });
}

export const exportStamp = (): string => new Date().toISOString().slice(0, 10);
