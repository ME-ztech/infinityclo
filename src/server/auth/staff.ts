import 'server-only';

import { and, count, eq, gt, isNull } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { can, isRole, type Permission, type Role } from '@/domain/rbac';
import { audit } from '@/server/audit';
import { getDb } from '@/server/db/client';
import { staffSessions, staffUsers } from '@/server/db/schema';
import { hashPassword, randomToken, sha256Hex, verifyPassword } from '@/server/security/crypto';
import { rateLimit } from '@/server/security/rate-limit';
import { requestContext, type RequestContext } from '@/server/security/request';

export const ADMIN_COOKIE = 'infnity_admin';
const IDLE_TIMEOUT_MS = 12 * 60 * 60 * 1000;
const ABSOLUTE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

export interface StaffSession {
  readonly sessionId: string;
  readonly user: {
    readonly id: string;
    readonly email: string;
    readonly name: string;
    readonly role: Role;
  };
}

export class ForbiddenError extends Error {
  constructor(public readonly permission: Permission) {
    super(`You do not have permission to do this (${permission}).`);
    this.name = 'ForbiddenError';
  }
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const PASSWORD_MIN_LENGTH = 12;

export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (password.length > 200) return 'Use at most 200 characters.';
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) return 'Use letters and at least one number.';
  return null;
}

/* ------------------------------------------------------------------ *
 * Bootstrap
 * ------------------------------------------------------------------ */

export async function staffCount(): Promise<number> {
  const db = await getDb();
  const [row] = await db.select({ value: count() }).from(staffUsers);
  return Number(row?.value ?? 0);
}

/**
 * Creates the first Owner from ADMIN_BOOTSTRAP_EMAIL / ADMIN_BOOTSTRAP_PASSWORD
 * when, and only when, no staff account exists yet. After that the variables
 * are inert and should be removed from the environment.
 */
export async function bootstrapOwnerFromEnv(): Promise<boolean> {
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL;
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!email || !password) return false;
  if ((await staffCount()) > 0) return false;
  if (passwordProblem(password)) {
    console.error('[admin] ADMIN_BOOTSTRAP_PASSWORD does not meet the password policy; owner not created.');
    return false;
  }
  await createStaffUser({ email, name: 'Owner', role: 'owner', password }, null);
  return true;
}

export async function createStaffUser(
  input: { email: string; name: string; role: Role; password: string },
  actor: StaffSession['user'] | null,
): Promise<string> {
  const problem = passwordProblem(input.password);
  if (problem) throw new Error(problem);
  const db = await getDb();
  const email = normaliseEmail(input.email);
  const [created] = await db
    .insert(staffUsers)
    .values({ email, name: input.name.trim() || email, role: input.role, passwordHash: await hashPassword(input.password) })
    .returning({ id: staffUsers.id });
  await audit({
    actor: actor ? { id: actor.id, email: actor.email } : { id: null, email: 'system' },
    action: 'staff.create',
    summary: `Created ${input.role} account ${email}`,
    targetType: 'staff',
    targetId: created!.id,
  });
  return created!.id;
}

/* ------------------------------------------------------------------ *
 * Login / logout
 * ------------------------------------------------------------------ */

export type LoginResult =
  | { ok: true; token: string; expiresAt: Date }
  | { ok: false; reason: 'invalid' | 'locked' | 'rate_limited' };

export async function attemptLogin(email: string, password: string, ctx: RequestContext): Promise<LoginResult> {
  const normalised = normaliseEmail(email);
  const [byIp, byAccount] = await Promise.all([
    rateLimit(`login:ip:${ctx.ipHash ?? 'unknown'}`, 20, 15 * 60),
    rateLimit(`login:acct:${sha256Hex(normalised)}`, 10, 15 * 60),
  ]);
  if (!byIp.allowed || !byAccount.allowed) return { ok: false, reason: 'rate_limited' };

  await bootstrapOwnerFromEnv();

  const db = await getDb();
  const [user] = await db.select().from(staffUsers).where(eq(staffUsers.email, normalised)).limit(1);

  // Always spend the scrypt cost so response time does not reveal whether the account exists.
  const valid = await verifyPassword(password, user?.passwordHash ?? 'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAA');

  if (!user || !user.active) {
    return { ok: false, reason: 'invalid' };
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { ok: false, reason: 'locked' };
  }
  if (!valid) {
    const failed = user.failedLoginCount + 1;
    await db
      .update(staffUsers)
      .set({
        failedLoginCount: failed >= MAX_FAILED_LOGINS ? 0 : failed,
        lockedUntil: failed >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCKOUT_MS) : user.lockedUntil,
      })
      .where(eq(staffUsers.id, user.id));
    await audit({
      actor: { id: user.id, email: user.email },
      action: failed >= MAX_FAILED_LOGINS ? 'staff.locked' : 'staff.login_failed',
      summary: failed >= MAX_FAILED_LOGINS ? 'Account locked after repeated failed sign-ins' : 'Failed sign-in',
      ipHash: ctx.ipHash,
    });
    return { ok: false, reason: failed >= MAX_FAILED_LOGINS ? 'locked' : 'invalid' };
  }

  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + ABSOLUTE_TIMEOUT_MS);
  await db.insert(staffSessions).values({
    id: sha256Hex(token),
    userId: user.id,
    expiresAt,
    ipHash: ctx.ipHash,
    userAgent: ctx.userAgent,
  });
  await db
    .update(staffUsers)
    .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() })
    .where(eq(staffUsers.id, user.id));
  await audit({ actor: { id: user.id, email: user.email }, action: 'staff.login', summary: 'Signed in', ipHash: ctx.ipHash });
  return { ok: true, token, expiresAt };
}

export async function setSessionCookie(token: string, expiresAt: Date, secure: boolean): Promise<void> {
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: '/',
    expires: expiresAt,
  });
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(ADMIN_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    const id = sha256Hex(token);
    const session = await getStaffSession();
    await db.update(staffSessions).set({ revokedAt: new Date() }).where(eq(staffSessions.id, id));
    if (session) {
      await audit({ actor: { id: session.user.id, email: session.user.email }, action: 'staff.logout', summary: 'Signed out' });
    }
  }
  jar.delete(ADMIN_COOKIE);
}

/* ------------------------------------------------------------------ *
 * Session lookup and guards
 * ------------------------------------------------------------------ */

export async function getStaffSession(): Promise<StaffSession | null> {
  const jar = await cookies();
  const token = jar.get(ADMIN_COOKIE)?.value;
  if (!token || token.length > 200) return null;

  const db = await getDb();
  const id = sha256Hex(token);
  const now = new Date();
  const [row] = await db
    .select({ session: staffSessions, user: staffUsers })
    .from(staffSessions)
    .innerJoin(staffUsers, eq(staffSessions.userId, staffUsers.id))
    .where(and(eq(staffSessions.id, id), isNull(staffSessions.revokedAt), gt(staffSessions.expiresAt, now)))
    .limit(1);

  if (!row || !row.user.active || !isRole(row.user.role)) return null;
  if (now.getTime() - row.session.lastSeenAt.getTime() > IDLE_TIMEOUT_MS) return null;

  if (now.getTime() - row.session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.update(staffSessions).set({ lastSeenAt: now }).where(eq(staffSessions.id, id));
  }

  return {
    sessionId: id,
    user: { id: row.user.id, email: row.user.email, name: row.user.name, role: row.user.role },
  };
}

/** For admin pages: redirect to sign-in, or to the forbidden page, as appropriate. */
export async function requireStaffPage(permission: Permission, from = '/admin'): Promise<StaffSession> {
  const session = await getStaffSession();
  if (!session) redirect(`/admin/login?next=${encodeURIComponent(from)}`);
  if (!can(session.user.role, permission)) redirect(`/admin/forbidden?p=${encodeURIComponent(permission)}`);
  return session;
}

/** For server actions and route handlers: throws rather than redirecting. */
export async function requireStaffAction(permission: Permission): Promise<StaffSession> {
  const session = await getStaffSession();
  if (!session) throw new ForbiddenError(permission);
  if (!can(session.user.role, permission)) throw new ForbiddenError(permission);
  return session;
}

export async function currentRequestIsHttps(): Promise<boolean> {
  return (await requestContext()).isHttps;
}

/* ------------------------------------------------------------------ *
 * Staff management (owner only)
 * ------------------------------------------------------------------ */

export async function listStaff() {
  const db = await getDb();
  return db
    .select({ id: staffUsers.id, email: staffUsers.email, name: staffUsers.name, role: staffUsers.role, active: staffUsers.active, lastLoginAt: staffUsers.lastLoginAt, lockedUntil: staffUsers.lockedUntil, createdAt: staffUsers.createdAt })
    .from(staffUsers)
    .orderBy(staffUsers.createdAt);
}

async function revokeAllSessions(userId: string) {
  const db = await getDb();
  await db.update(staffSessions).set({ revokedAt: new Date() }).where(and(eq(staffSessions.userId, userId), isNull(staffSessions.revokedAt)));
}

async function activeOwnerCount(): Promise<number> {
  const db = await getDb();
  const [row] = await db.select({ value: count() }).from(staffUsers).where(and(eq(staffUsers.role, 'owner'), eq(staffUsers.active, true)));
  return Number(row?.value ?? 0);
}

export async function updateStaff(
  id: string,
  update: { role?: Role; active?: boolean; password?: string },
  actor: StaffSession['user'],
): Promise<void> {
  const db = await getDb();
  const [target] = await db.select().from(staffUsers).where(eq(staffUsers.id, id)).limit(1);
  if (!target) throw new Error('Staff member not found.');
  const losingOwner = target.role === 'owner' && target.active && ((update.role && update.role !== 'owner') || update.active === false);
  if (losingOwner && (await activeOwnerCount()) <= 1) throw new Error('There must always be at least one active owner.');
  if (update.password) {
    const problem = passwordProblem(update.password);
    if (problem) throw new Error(problem);
  }
  await db
    .update(staffUsers)
    .set({
      ...(update.role ? { role: update.role } : {}),
      ...(update.active !== undefined ? { active: update.active } : {}),
      ...(update.password ? { passwordHash: await hashPassword(update.password), failedLoginCount: 0, lockedUntil: null } : {}),
      updatedAt: new Date(),
    })
    .where(eq(staffUsers.id, id));
  // Any change to access ends existing sessions, so it takes effect immediately.
  if (update.role || update.active === false || update.password) await revokeAllSessions(id);
  await audit({
    actor: { id: actor.id, email: actor.email },
    action: 'staff.update',
    summary: `Updated ${target.email}: ${[update.role && `role → ${update.role}`, update.active !== undefined && (update.active ? 'activated' : 'deactivated'), update.password && 'password reset'].filter(Boolean).join(', ')}`,
    targetType: 'staff',
    targetId: id,
  });
}
