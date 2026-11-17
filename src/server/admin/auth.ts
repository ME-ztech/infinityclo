/**
 * Back-office authentication and authorisation.
 *
 * - The Owner is bootstrapped from the environment (ADMIN_OWNER_EMAIL +
 *   ADMIN_OWNER_PASSWORD_HASH). There are no default credentials: without both
 *   variables and a session secret, nobody can sign in.
 * - Additional staff live in the `staff` collection with scrypt password hashes.
 * - A session is a sealed, HTTP-only cookie carrying the account id, role and a
 *   password-version stamp, valid for eight hours. Every guarded request
 *   re-reads the account, so disabling a member or changing their role or
 *   password takes effect on their next request, not at cookie expiry.
 * - `requirePermission` is the single server-side guard. Pages, server actions
 *   and API routes all go through it; the client is never trusted.
 */
import 'server-only';

import { cookies, headers } from 'next/headers';

import { audit } from '../audit';
import { config } from '../config';
import {
  cookieAttributes,
  hashPassword,
  normaliseEmail,
  passwordProblem,
  rateLimit,
  seal,
  sessionSecret,
  stableHash,
  unseal,
  verifyPassword,
} from '../security';
import { getStore, newId } from '../store';

import { can, isRole, type Permission, type Role } from './permissions';

export const ADMIN_COOKIE = 'infnity_admin';
const SESSION_PURPOSE = 'admin-session';
const SESSION_SECONDS = 8 * 60 * 60;
export const OWNER_ID = 'owner-env';

export interface StaffRecord {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly role: Role;
  readonly passwordHash: string;
  readonly disabled: boolean;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly updatedAt: string;
}

export interface AdminSession {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly role: Role;
}

interface SessionPayload {
  readonly id: string;
  /** Changes whenever the account's password hash changes. */
  readonly stamp: string;
}

interface Account extends AdminSession {
  readonly passwordHash: string;
  readonly disabled: boolean;
}

export class AdminAuthError extends Error {
  constructor(
    message: string,
    readonly reason: 'unauthenticated' | 'forbidden' | 'cross_site',
  ) {
    super(message);
    this.name = 'AdminAuthError';
  }
}

/* ------------------------------------------------------------------ *
 * Readiness
 * ------------------------------------------------------------------ */

export interface LoginReadiness {
  readonly ready: boolean;
  /** Exactly what is missing, in configuration terms. Names only. */
  readonly missing: readonly string[];
}

export function loginReadiness(): LoginReadiness {
  const missing: string[] = [];
  if (!sessionSecret()) missing.push('SESSION_SECRET (at least 32 characters)');
  if (!config.admin.ownerEmail) missing.push('ADMIN_OWNER_EMAIL');
  if (!config.admin.ownerPasswordHash) missing.push('ADMIN_OWNER_PASSWORD_HASH');
  return { ready: missing.length === 0, missing };
}

/* ------------------------------------------------------------------ *
 * Accounts
 * ------------------------------------------------------------------ */

function ownerAccount(): Account | null {
  const { ownerEmail, ownerPasswordHash } = config.admin;
  if (!ownerEmail || !ownerPasswordHash) return null;
  return { id: OWNER_ID, email: ownerEmail, name: 'Owner', role: 'owner', passwordHash: ownerPasswordHash, disabled: false };
}

export async function listStaff(): Promise<StaffRecord[]> {
  return (await getStore().list<StaffRecord>('staff')).sort((a, b) => a.email.localeCompare(b.email));
}

async function accountById(id: string): Promise<Account | null> {
  if (id === OWNER_ID) return ownerAccount();
  const record = await getStore().get<StaffRecord>('staff', id);
  return record ? { ...record } : null;
}

async function accountByEmail(email: string): Promise<Account | null> {
  const owner = ownerAccount();
  if (owner && owner.email === email) return owner;
  const staff = await listStaff();
  const record = staff.find((member) => member.email === email);
  return record ? { ...record } : null;
}

const stampOf = (account: Account): string => stableHash(account.passwordHash);

/* ------------------------------------------------------------------ *
 * Sign in / out
 * ------------------------------------------------------------------ */

export type LoginResult =
  | { ok: true; session: AdminSession }
  | { ok: false; reason: 'not_configured' | 'rate_limited' | 'invalid'; retryAfterSeconds?: number };

const LOGIN_LIMIT = 5;
const LOGIN_WINDOW_SECONDS = 15 * 60;

/**
 * Verifies credentials and, on success, returns the sealed cookie value.
 * The same generic failure is returned for an unknown address, a disabled
 * account and a wrong password, and all three cost the same scrypt work.
 */
export async function authenticate(
  emailInput: unknown,
  passwordInput: unknown,
  address: string,
): Promise<LoginResult & { cookie?: string }> {
  if (!loginReadiness().ready) return { ok: false, reason: 'not_configured' };

  const email = normaliseEmail(emailInput) ?? '';
  const password = typeof passwordInput === 'string' ? passwordInput.slice(0, 400) : '';

  const limit = rateLimit('admin-login', `${address}:${email}`, LOGIN_LIMIT, LOGIN_WINDOW_SECONDS);
  if (!limit.allowed) {
    await audit({
      actor: email || 'unknown',
      role: 'none',
      action: 'auth.login',
      target: 'session',
      outcome: 'denied',
      detail: 'Too many attempts; temporarily locked.',
      mode: 'local',
    });
    return { ok: false, reason: 'rate_limited', retryAfterSeconds: limit.retryAfterSeconds };
  }

  const account = email ? await accountByEmail(email) : null;
  const valid = await verifyPassword(password, account?.passwordHash ?? null);

  if (!account || !valid || account.disabled) {
    await audit({
      actor: email || 'unknown',
      role: 'none',
      action: 'auth.login',
      target: 'session',
      outcome: 'denied',
      detail: 'Invalid credentials.',
      mode: 'local',
    });
    return { ok: false, reason: 'invalid' };
  }

  const payload: SessionPayload = { id: account.id, stamp: stampOf(account) };
  const cookie = seal(payload, SESSION_PURPOSE, SESSION_SECONDS);
  if (!cookie) return { ok: false, reason: 'not_configured' };

  const session: AdminSession = { id: account.id, email: account.email, name: account.name, role: account.role };
  await audit({
    actor: session.email,
    role: session.role,
    action: 'auth.login',
    target: 'session',
    outcome: 'ok',
    detail: 'Signed in.',
    mode: 'local',
  });
  return { ok: true, session, cookie };
}

export async function setSessionCookie(value: string): Promise<void> {
  (await cookies()).set(ADMIN_COOKIE, value, cookieAttributes({ maxAge: SESSION_SECONDS }));
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).set(ADMIN_COOKIE, '', { ...cookieAttributes({ maxAge: 0 }), maxAge: 0 });
}

/** Resolves a sealed cookie value to a live session, or null. */
export async function sessionFromCookieValue(value: string | undefined | null): Promise<AdminSession | null> {
  const payload = unseal<SessionPayload>(value, SESSION_PURPOSE);
  if (!payload?.id) return null;
  const account = await accountById(payload.id);
  if (!account || account.disabled || stampOf(account) !== payload.stamp) return null;
  if (!isRole(account.role)) return null;
  return { id: account.id, email: account.email, name: account.name, role: account.role };
}

export async function getSession(): Promise<AdminSession | null> {
  return sessionFromCookieValue((await cookies()).get(ADMIN_COOKIE)?.value);
}

/* ------------------------------------------------------------------ *
 * Guards
 * ------------------------------------------------------------------ */

/** Pure check used by the guard and by tests. */
export function authorise(session: AdminSession | null, permission: Permission): AdminSession {
  if (!session) throw new AdminAuthError('Sign in to continue.', 'unauthenticated');
  if (!can(session.role, permission)) {
    throw new AdminAuthError('Your role does not allow this action.', 'forbidden');
  }
  return session;
}

/**
 * The one guard. Throws `AdminAuthError` when there is no session or the role
 * lacks the permission, and records the denial.
 */
export async function requirePermission(permission: Permission, target = ''): Promise<AdminSession> {
  const session = await getSession();
  try {
    return authorise(session, permission);
  } catch (error) {
    if (error instanceof AdminAuthError && error.reason === 'forbidden' && session) {
      await audit({
        actor: session.email,
        role: session.role,
        action: `guard.${permission}`,
        target: target || permission,
        outcome: 'denied',
        detail: 'Permission denied.',
        mode: 'local',
      });
    }
    throw error;
  }
}

/** Same-origin check for server actions, read from the incoming headers. */
export async function assertSameOrigin(): Promise<void> {
  const list = await headers();
  const host = list.get('x-forwarded-host') ?? list.get('host');
  const source = list.get('origin') ?? list.get('referer');
  let matches = false;
  try {
    matches = Boolean(host && source && new URL(source).host === host);
  } catch {
    matches = false;
  }
  if (!matches) throw new AdminAuthError('Cross-site request refused.', 'cross_site');
}

export async function requestAddress(): Promise<string> {
  const list = await headers();
  return list.get('x-forwarded-for')?.split(',')[0]?.trim() || list.get('x-real-ip') || 'unknown';
}

/* ------------------------------------------------------------------ *
 * Staff management (Owner only — callers must hold `staff.manage`)
 * ------------------------------------------------------------------ */

export async function createStaff(
  input: { email: unknown; name: unknown; role: unknown; password: unknown },
  actor: string,
): Promise<StaffRecord> {
  const email = normaliseEmail(input.email);
  if (!email) throw new Error('Enter a valid email address.');
  if (!isRole(input.role)) throw new Error('Choose a role.');
  const name = typeof input.name === 'string' ? input.name.trim().slice(0, 80) : '';
  if (!name) throw new Error('Enter a name.');
  const password = typeof input.password === 'string' ? input.password : '';
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  if (await accountByEmail(email)) throw new Error('An account with that email already exists.');

  const now = new Date().toISOString();
  const record: StaffRecord = {
    id: newId('stf'),
    email,
    name,
    role: input.role,
    passwordHash: await hashPassword(password),
    disabled: false,
    createdAt: now,
    createdBy: actor,
    updatedAt: now,
  };
  await getStore().put('staff', record.id, record);
  return record;
}

async function activeOwnerCount(excludingId?: string): Promise<number> {
  const staff = await listStaff();
  const stored = staff.filter((member) => member.role === 'owner' && !member.disabled && member.id !== excludingId).length;
  return stored + (ownerAccount() ? 1 : 0);
}

export async function updateStaff(
  id: string,
  change: { role?: unknown; disabled?: boolean; password?: unknown },
): Promise<StaffRecord> {
  const record = await getStore().get<StaffRecord>('staff', id);
  if (!record) throw new Error('Staff member not found.');
  let next: StaffRecord = record;

  if (change.role !== undefined) {
    if (!isRole(change.role)) throw new Error('Choose a role.');
    next = { ...next, role: change.role };
  }
  if (change.disabled !== undefined) next = { ...next, disabled: change.disabled };
  if (typeof change.password === 'string' && change.password) {
    const problem = passwordProblem(change.password);
    if (problem) throw new Error(problem);
    next = { ...next, passwordHash: await hashPassword(change.password) };
  }

  const losesOwner = record.role === 'owner' && !record.disabled && (next.role !== 'owner' || next.disabled);
  if (losesOwner && (await activeOwnerCount(id)) === 0) {
    throw new Error('The last Owner cannot be removed or disabled.');
  }

  next = { ...next, updatedAt: new Date().toISOString() };
  await getStore().put('staff', id, next);
  return next;
}

export async function deleteStaff(id: string): Promise<void> {
  const record = await getStore().get<StaffRecord>('staff', id);
  if (!record) return;
  if (record.role === 'owner' && !record.disabled && (await activeOwnerCount(id)) === 0) {
    throw new Error('The last Owner cannot be removed or disabled.');
  }
  await getStore().delete('staff', id);
}
