'use server';

import { redirect } from 'next/navigation';

import { attemptLogin, logout, setSessionCookie, staffCount } from '@/server/auth/staff';
import { requestContext } from '@/server/security/request';

export interface LoginState {
  error?: string;
}

export async function loginAction(_state: LoginState | null, form: FormData): Promise<LoginState> {
  const email = String(form.get('email') ?? '').slice(0, 254);
  const password = String(form.get('password') ?? '').slice(0, 200);
  const next = String(form.get('next') ?? '/admin');
  if (!email || !password) return { error: 'Enter your email and password.' };
  const context = await requestContext();
  const result = await attemptLogin(email, password, context);
  if (!result.ok) {
    if (result.reason === 'locked') return { error: 'This account is temporarily locked after too many attempts. Try again in 15 minutes.' };
    if (result.reason === 'rate_limited') return { error: 'Too many attempts. Wait a few minutes and try again.' };
    if ((await staffCount()) === 0) {
      return { error: 'No staff accounts exist yet. Create the owner with `npm run admin:create-owner` or ADMIN_BOOTSTRAP_EMAIL/ADMIN_BOOTSTRAP_PASSWORD.' };
    }
    return { error: 'Email or password is incorrect.' };
  }
  await setSessionCookie(result.token, result.expiresAt, context.isHttps);
  redirect(next.startsWith('/admin') && !next.startsWith('//') ? next : '/admin');
}

export async function logoutAction(): Promise<void> {
  await logout();
  redirect('/admin/login');
}
