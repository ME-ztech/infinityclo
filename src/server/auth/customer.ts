import 'server-only';

import { cookies } from 'next/headers';

import { seal, unseal } from '@/server/security/crypto';
import type { CustomerTokens } from '@/server/shopify/customer-account';

/**
 * The customer's Shopify session, sealed (AES-256-GCM) into an HttpOnly cookie.
 * Tokens never reach client JavaScript. No customer data is stored server-side
 * by this app, so there is nothing to leak across users from a shared cache:
 * account pages are rendered per request with `Cache-Control: private, no-store`.
 */

export const CUSTOMER_COOKIE = 'infnity_customer';
export const OAUTH_COOKIE = 'infnity_oauth';
const SESSION_PURPOSE = 'customer-session';
const OAUTH_PURPOSE = 'customer-oauth';
const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

export interface CustomerSession extends CustomerTokens {
  readonly email: string | null;
}

export interface OAuthState {
  readonly state: string;
  readonly nonce: string;
  readonly verifier: string;
  readonly returnTo: string;
  readonly createdAt: number;
}

export async function getCustomerSession(): Promise<CustomerSession | null> {
  const jar = await cookies();
  return unseal<CustomerSession>(jar.get(CUSTOMER_COOKIE)?.value, SESSION_PURPOSE);
}

export function isSessionExpired(session: CustomerSession, now = Date.now()): boolean {
  return session.expiresAt <= now;
}

export async function setCustomerSession(session: CustomerSession, secure: boolean): Promise<void> {
  const jar = await cookies();
  jar.set(CUSTOMER_COOKIE, seal(session, SESSION_PURPOSE), {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearCustomerSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(CUSTOMER_COOKIE);
}

export async function setOAuthState(value: OAuthState, secure: boolean): Promise<void> {
  const jar = await cookies();
  jar.set(OAUTH_COOKIE, seal(value, OAUTH_PURPOSE), {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/account',
    maxAge: 10 * 60,
  });
}

export async function takeOAuthState(): Promise<OAuthState | null> {
  const jar = await cookies();
  const value = unseal<OAuthState>(jar.get(OAUTH_COOKIE)?.value, OAUTH_PURPOSE);
  jar.delete(OAUTH_COOKIE);
  if (!value || Date.now() - value.createdAt > 10 * 60 * 1000) return null;
  return value;
}

/** Only same-site relative paths are accepted as post-login destinations. */
export function safeReturnTo(value: string | null | undefined, fallback = '/account'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback;
  return value.slice(0, 300);
}
