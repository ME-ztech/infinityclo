/**
 * Page-level guard for admin screens.
 *
 * Server components call this first. No session sends the visitor to the login
 * page; a session without the permission is sent back to the overview with an
 * explanation. Rendering never starts for a request that is not allowed.
 */
import 'server-only';

import { redirect } from 'next/navigation';

import { withFlash } from './action';
import { getSession, type AdminSession } from './auth';
import { can, type Permission } from './permissions';

export async function requirePage(permission: Permission): Promise<AdminSession> {
  const session = await getSession();
  if (!session) redirect('/admin/login');
  if (!can(session.role, permission)) {
    redirect(withFlash('/admin', 'error', 'Your role does not have access to that section.'));
  }
  return session;
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const param = (params: Record<string, string | string[] | undefined>, name: string): string => {
  const value = params[name];
  return typeof value === 'string' ? value.slice(0, 200) : '';
};
