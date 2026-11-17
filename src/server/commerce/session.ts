/**
 * Request-scoped cookies for the customer session and the active checkout.
 *
 * Both cookies hold an opaque random token whose hash is looked up in the
 * database; neither contains any customer data. They are httpOnly (script
 * cannot read them), SameSite=Lax, and Secure in production.
 */
import 'server-only';

import { cookies } from 'next/headers';
import { cache } from 'react';

import { config } from '../config';

import { CHECKOUT_TTL_MINUTES } from './checkout';
import { SESSION_DAYS, customerForSession, type Customer } from './customers';

export const SESSION_COOKIE = 'infnity_session';
export const CHECKOUT_COOKIE = 'infnity_checkout';

const base = () => ({ httpOnly: true, secure: config.isProduction, sameSite: 'lax' as const, path: '/' });

export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, { ...base(), maxAge: SESSION_DAYS * 86_400 });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, '', { ...base(), maxAge: 0 });
}

export async function sessionToken(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

/** The signed-in customer for this request, looked up at most once. */
export const currentCustomer = cache(async (): Promise<Customer | null> => {
  try {
    return await customerForSession(await sessionToken());
  } catch {
    // No database: nobody is signed in.
    return null;
  }
});

export async function setCheckoutCookie(token: string): Promise<void> {
  (await cookies()).set(CHECKOUT_COOKIE, token, { ...base(), maxAge: CHECKOUT_TTL_MINUTES * 60 + 3600 });
}

export async function checkoutToken(): Promise<string | null> {
  return (await cookies()).get(CHECKOUT_COOKIE)?.value ?? null;
}

export async function clearCheckoutCookie(): Promise<void> {
  (await cookies()).set(CHECKOUT_COOKIE, '', { ...base(), maxAge: 0 });
}

/** For account pages: the signed-in customer, or a redirect to sign in and come back. */
export async function requireCustomerPage(path: string): Promise<Customer> {
  const customer = await currentCustomer();
  if (!customer) {
    const { redirect } = await import('next/navigation');
    redirect(`/account/login?returnTo=${encodeURIComponent(path)}`);
  }
  return customer!;
}

/** Only same-site relative paths may be used as a post-sign-in destination. */
export function safeReturnTo(value: unknown, fallback = '/account'): string {
  return typeof value === 'string' && /^\/(?!\/)[\w\-./?=&%]*$/.test(value) && !value.startsWith('/api/') ? value : fallback;
}
