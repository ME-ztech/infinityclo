'use server';

import { redirect } from 'next/navigation';

import { field, withFlash } from '@/server/admin/action';
import {
  AdminAuthError,
  assertSameOrigin,
  authenticate,
  clearSessionCookie,
  getSession,
  requestAddress,
  setSessionCookie,
} from '@/server/admin/auth';
import { audit } from '@/server/audit';

export async function loginAction(form: FormData): Promise<void> {
  try {
    await assertSameOrigin();
  } catch (error) {
    if (error instanceof AdminAuthError) redirect(withFlash('/admin/login', 'error', error.message));
    throw error;
  }

  const result = await authenticate(field(form, 'email', 254), form.get('password'), await requestAddress());
  if (!result.ok || !result.cookie) {
    const message =
      result.ok || result.reason === 'not_configured'
        ? 'Sign-in is not configured on this deployment yet.'
        : result.reason === 'rate_limited'
          ? `Too many attempts. Try again in ${Math.ceil((result.retryAfterSeconds ?? 900) / 60)} minutes.`
          : 'That email and password do not match an active account.';
    redirect(withFlash('/admin/login', 'error', message));
  }
  await setSessionCookie(result.cookie);
  redirect('/admin');
}

export async function logoutAction(): Promise<void> {
  try {
    await assertSameOrigin();
  } catch (error) {
    if (error instanceof AdminAuthError) redirect('/admin');
    throw error;
  }
  const session = await getSession();
  await clearSessionCookie();
  if (session) {
    await audit({
      actor: session.email,
      role: session.role,
      action: 'auth.logout',
      target: 'session',
      outcome: 'ok',
      detail: 'Signed out.',
      mode: 'local',
    });
  }
  redirect(withFlash('/admin/login', 'ok', 'You are signed out.'));
}
