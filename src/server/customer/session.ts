/**
 * Customer session.
 *
 * The session is the set of tokens Shopify issued, sealed (AES-256-GCM) into
 * httpOnly cookies. There is no server-side session table and no password: if
 * the seal is missing, tampered with or expired, the customer is signed out.
 *
 * Expiry is enforced three ways: the seal's own TTL, a hard 30-day ceiling from
 * the moment of sign-in, and the access token's expiry (refreshed when Shopify
 * allows it, otherwise the customer signs in again).
 *
 * The shopping cart is deliberately *not* part of the session. It lives in
 * localStorage as line identities, so it is untouched by signing in or out and
 * guest shopping never depends on an account.
 */
import 'server-only';

import { cookies } from 'next/headers';

import { cookieAttributes, seal, unseal } from '../security';
import type { LoginAttempt, TokenSet } from '../shopify/customer-account';

export const SESSION_COOKIE = 'infnity_customer';
export const LOGIN_COOKIE = 'infnity_customer_login';
const SESSION_PURPOSE = 'customer-session';
const LOGIN_PURPOSE = 'customer-login';

export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
export const LOGIN_MAX_AGE_SECONDS = 10 * 60;
/** Refresh when the access token has less than this left. */
export const REFRESH_WINDOW_MS = 2 * 60 * 1000;

/** Browsers cap a cookie near 4KB; a sealed session with an ID token can exceed that. */
const CHUNK_SIZE = 3500;
const MAX_CHUNKS = 5;

export interface CustomerSession extends TokenSet {
  /** The `sub` claim of the ID token. Informational; never used to scope a query. */
  readonly subject: string;
  /** Epoch milliseconds of the original sign-in. */
  readonly signedInAt: number;
}

export interface CookieJar {
  get(name: string): { value: string } | undefined;
  set(name: string, value: string, options: Record<string, unknown>): void;
}

export function splitIntoChunks(value: string, size = CHUNK_SIZE): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < value.length; index += size) chunks.push(value.slice(index, index + size));
  return chunks;
}

function readChunked(jar: CookieJar, name: string): string | null {
  const first = jar.get(name)?.value;
  if (!first) return null;
  const match = /^(\d)\.(.*)$/s.exec(first);
  if (!match) return first;
  const count = Number(match[1]);
  let value = match[2]!;
  for (let index = 1; index < count; index += 1) {
    const part = jar.get(`${name}.${index}`)?.value;
    if (part === undefined) return null;
    value += part;
  }
  return value;
}

function writeChunked(jar: CookieJar, name: string, value: string, maxAge: number): boolean {
  const chunks = splitIntoChunks(value);
  if (chunks.length > MAX_CHUNKS) return false;
  const attributes = cookieAttributes({ maxAge });
  jar.set(name, `${chunks.length}.${chunks[0] ?? ''}`, attributes);
  for (let index = 1; index < MAX_CHUNKS; index += 1) {
    const chunk = chunks[index];
    if (chunk !== undefined) jar.set(`${name}.${index}`, chunk, attributes);
    else if (jar.get(`${name}.${index}`)) jar.set(`${name}.${index}`, '', { ...attributes, maxAge: 0 });
  }
  return true;
}

function clearChunked(jar: CookieJar, name: string): void {
  const attributes = { ...cookieAttributes({ maxAge: 0 }), maxAge: 0 };
  jar.set(name, '', attributes);
  for (let index = 1; index < MAX_CHUNKS; index += 1) {
    if (jar.get(`${name}.${index}`)) jar.set(`${name}.${index}`, '', attributes);
  }
}

/* ---------------------------- session ----------------------------- */

export function readSessionFrom(jar: CookieJar, now: number = Date.now()): CustomerSession | null {
  const session = unseal<CustomerSession>(readChunked(jar, SESSION_COOKIE), SESSION_PURPOSE);
  if (!session || typeof session.accessToken !== 'string' || typeof session.signedInAt !== 'number') return null;
  if (now - session.signedInAt > SESSION_MAX_AGE_SECONDS * 1000) return null;
  return session;
}

/** Returns false when the session could not be stored (no secret, or too large). */
export function writeSessionTo(jar: CookieJar, session: CustomerSession, now: number = Date.now()): boolean {
  const remaining = Math.floor((session.signedInAt + SESSION_MAX_AGE_SECONDS * 1000 - now) / 1000);
  if (remaining <= 0) return false;
  const sealed = seal(session, SESSION_PURPOSE, remaining);
  if (!sealed) return false;
  return writeChunked(jar, SESSION_COOKIE, sealed, remaining);
}

export function clearSessionIn(jar: CookieJar): void {
  clearChunked(jar, SESSION_COOKIE);
}

export const needsRefresh = (session: CustomerSession, now: number = Date.now()): boolean =>
  session.expiresAt - now < REFRESH_WINDOW_MS;

/* ------------------------- login attempt -------------------------- */

export function writeLoginAttemptTo(jar: CookieJar, attempt: LoginAttempt): boolean {
  const sealed = seal(attempt, LOGIN_PURPOSE, LOGIN_MAX_AGE_SECONDS);
  if (!sealed) return false;
  jar.set(LOGIN_COOKIE, sealed, cookieAttributes({ maxAge: LOGIN_MAX_AGE_SECONDS }));
  return true;
}

export function readLoginAttemptFrom(jar: CookieJar): LoginAttempt | null {
  const attempt = unseal<LoginAttempt>(jar.get(LOGIN_COOKIE)?.value, LOGIN_PURPOSE);
  if (!attempt || typeof attempt.state !== 'string' || typeof attempt.codeVerifier !== 'string') return null;
  return attempt;
}

export function clearLoginAttemptIn(jar: CookieJar): void {
  jar.set(LOGIN_COOKIE, '', { ...cookieAttributes({ maxAge: 0 }), maxAge: 0 });
}

/* ----------------------------- flash ------------------------------ */

export const FLASH_COOKIE = 'infnity_account_flash';
export const FLASH_PURPOSE = 'account-flash';
export const FLASH_TTL_SECONDS = 20;

/** One-time result of a form post, shown on the page the customer lands back on. */
export interface AccountFlash {
  readonly notice?: string;
  readonly error?: string;
}

/* --------------------------- next/headers -------------------------- */

/** The current customer session, or null when signed out. Read-only. */
export async function readSession(): Promise<CustomerSession | null> {
  return readSessionFrom((await cookies()) as unknown as CookieJar);
}

/**
 * The message left by the last form post, if it is still fresh. The cookie
 * expires on its own after a few seconds; a server component cannot clear it.
 */
export async function readFlash(): Promise<AccountFlash> {
  const jar = await cookies();
  return unseal<AccountFlash>(jar.get(FLASH_COOKIE)?.value, FLASH_PURPOSE) ?? {};
}
