/**
 * Customer accounts — registration, sign-in, sessions, email verification,
 * password reset, profile and addresses. All of it lives in INFNITY's own
 * database; no third party holds an account.
 *
 * Security properties:
 *
 * - Passwords are hashed with scrypt (`src/server/security.ts`). Verification
 *   takes the same time whether or not the account exists.
 * - Sessions are random bearer tokens. Only a SHA-256 of the token is stored,
 *   so a database leak yields no usable session. Sessions expire, can be
 *   revoked individually, and are all revoked when the password changes.
 * - Verification and reset tokens are single-use, expiring and stored hashed.
 * - Responses never reveal whether an email address has an account
 *   (registration and reset both answer identically either way).
 * - Marketing consent is its own explicit field. Creating an account never
 *   sets it.
 */
import 'server-only';

import { and, desc, eq, gt, isNull, ne } from 'drizzle-orm';

import { getDb, schema } from '../db/client';
import { hashToken, newId, newToken } from '../db/ids';
import { hashPassword, normaliseEmail, passwordProblem, verifyPassword } from '../security';

import { parseAddress } from './checkout';

const { customers, customerSessions, customerTokens, customerAddresses, orders } = schema;

export type Customer = typeof customers.$inferSelect;
export type CustomerAddress = typeof customerAddresses.$inferSelect;

export const SESSION_DAYS = 30;
export const VERIFY_HOURS = 48;
export const RESET_MINUTES = 60;

export class AccountError extends Error {
  constructor(
    message: string,
    readonly code: 'invalid' | 'credentials' | 'token' | 'not_found',
  ) {
    super(message);
    this.name = 'AccountError';
  }
}

const name = (value: unknown): string =>
  typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 80) : '';

async function issueToken(customerId: string, kind: 'verify_email' | 'password_reset', ttlMs: number): Promise<string> {
  const db = await getDb();
  const { token, hash } = newToken();
  await db.insert(customerTokens).values({
    id: newId('tok'),
    customerId,
    kind,
    tokenHash: hash,
    expiresAt: new Date(Date.now() + ttlMs),
  });
  return token;
}

/** Claims a token exactly once. Returns the customer id, or null if unusable. */
async function consumeToken(token: string, kind: 'verify_email' | 'password_reset'): Promise<string | null> {
  const db = await getDb();
  const [used] = await db
    .update(customerTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(customerTokens.tokenHash, hashToken(token)),
        eq(customerTokens.kind, kind),
        isNull(customerTokens.usedAt),
        gt(customerTokens.expiresAt, new Date()),
      ),
    )
    .returning({ customerId: customerTokens.customerId });
  return used?.customerId ?? null;
}

/* ------------------------------------------------------------------ *
 * Registration and verification
 * ------------------------------------------------------------------ */

export interface RegisterInput {
  readonly email: unknown;
  readonly password: unknown;
  readonly firstName?: unknown;
  readonly lastName?: unknown;
  /** Explicit, unticked-by-default checkbox. */
  readonly marketingConsent?: unknown;
}

export type RegisterResult =
  /** A new account. Send the verification link. */
  | { outcome: 'created'; customer: Customer; verifyToken: string }
  /** A migrated account with no password yet: this sets it, pending verification. */
  | { outcome: 'claimed'; customer: Customer; verifyToken: string }
  /** The address already has an account. Tell the *owner of the address*, not the requester. */
  | { outcome: 'exists'; customer: Customer };

/**
 * Registers an account. The caller must respond identically for every outcome
 * ("check your email") and send a different email for `exists`, so the form
 * cannot be used to discover who has an account.
 */
export async function registerCustomer(input: RegisterInput): Promise<RegisterResult> {
  const email = normaliseEmail(input.email);
  if (!email) throw new AccountError('Enter a valid email address.', 'invalid');
  if (typeof input.password !== 'string') throw new AccountError('Enter a password.', 'invalid');
  const problem = passwordProblem(input.password);
  if (problem) throw new AccountError(problem, 'invalid');

  const db = await getDb();
  const consent = input.marketingConsent === true;
  const passwordHash = await hashPassword(input.password);
  const [existing] = await db.select().from(customers).where(eq(customers.email, email));

  if (existing?.passwordHash) return { outcome: 'exists', customer: existing };

  if (existing) {
    // Imported from the legacy store without a password. Proving control of the
    // inbox (the verification link) is what completes the claim.
    const [claimed] = await db
      .update(customers)
      .set({
        passwordHash,
        firstName: existing.firstName || name(input.firstName),
        lastName: existing.lastName || name(input.lastName),
        emailVerifiedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(customers.id, existing.id))
      .returning();
    return { outcome: 'claimed', customer: claimed!, verifyToken: await issueToken(existing.id, 'verify_email', VERIFY_HOURS * 3_600_000) };
  }

  const [created] = await db
    .insert(customers)
    .values({
      id: newId('cus'),
      email,
      passwordHash,
      firstName: name(input.firstName),
      lastName: name(input.lastName),
      marketingConsent: consent,
      marketingConsentAt: consent ? new Date() : null,
      marketingConsentSource: consent ? 'registration' : null,
    })
    .returning();
  return { outcome: 'created', customer: created!, verifyToken: await issueToken(created!.id, 'verify_email', VERIFY_HOURS * 3_600_000) };
}

export async function verifyEmail(token: string): Promise<Customer> {
  const customerId = await consumeToken(token, 'verify_email');
  if (!customerId) throw new AccountError('This verification link is invalid or has expired.', 'token');
  const db = await getDb();
  const [customer] = await db
    .update(customers)
    .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
    .where(eq(customers.id, customerId))
    .returning();
  // Orders placed as a guest with this address now belong to the verified account.
  await db
    .update(orders)
    .set({ customerId })
    .where(and(eq(orders.email, customer!.email), isNull(orders.customerId)));
  return customer!;
}

export async function resendVerification(customerId: string): Promise<string> {
  return issueToken(customerId, 'verify_email', VERIFY_HOURS * 3_600_000);
}

/* ------------------------------------------------------------------ *
 * Sign-in and sessions
 * ------------------------------------------------------------------ */

/**
 * Checks credentials and opens a session. An unverified address cannot sign
 * in: otherwise anyone could register someone else's email and read the guest
 * orders attached to it.
 */
export async function signIn(emailInput: unknown, password: unknown): Promise<{ customer: Customer; sessionToken: string }> {
  const email = normaliseEmail(emailInput);
  const db = await getDb();
  const [customer] = email ? await db.select().from(customers).where(eq(customers.email, email)) : [];
  const ok = await verifyPassword(typeof password === 'string' ? password : '', customer?.passwordHash ?? null);
  if (!customer || !ok || customer.disabledAt) {
    throw new AccountError('That email and password do not match an account.', 'credentials');
  }
  if (!customer.emailVerifiedAt) {
    throw new AccountError('Confirm your email address first — check your inbox for the link.', 'credentials');
  }
  return { customer, sessionToken: await openSession(customer.id) };
}

export async function openSession(customerId: string): Promise<string> {
  const db = await getDb();
  const { token, hash } = newToken();
  await db.insert(customerSessions).values({
    id: newId('ses'),
    customerId,
    tokenHash: hash,
    expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000),
  });
  return token;
}

/** The signed-in customer for a session token, or null. */
export async function customerForSession(token: string | undefined | null): Promise<Customer | null> {
  if (!token) return null;
  const db = await getDb();
  const [row] = await db
    .select({ customer: customers })
    .from(customerSessions)
    .innerJoin(customers, eq(customers.id, customerSessions.customerId))
    .where(
      and(
        eq(customerSessions.tokenHash, hashToken(token)),
        isNull(customerSessions.revokedAt),
        gt(customerSessions.expiresAt, new Date()),
        isNull(customers.disabledAt),
      ),
    );
  return row?.customer ?? null;
}

export async function signOut(token: string | undefined | null): Promise<void> {
  if (!token) return;
  const db = await getDb();
  await db.update(customerSessions).set({ revokedAt: new Date() }).where(eq(customerSessions.tokenHash, hashToken(token)));
}

async function revokeAllSessions(customerId: string, exceptTokenHash?: string): Promise<void> {
  const db = await getDb();
  await db
    .update(customerSessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(customerSessions.customerId, customerId),
        isNull(customerSessions.revokedAt),
        exceptTokenHash ? ne(customerSessions.tokenHash, exceptTokenHash) : undefined,
      ),
    );
}

/* ------------------------------------------------------------------ *
 * Password reset and change
 * ------------------------------------------------------------------ */

/**
 * Starts a reset. Returns the token to email when the address has an account,
 * and null otherwise — the caller answers the same either way.
 */
export async function requestPasswordReset(emailInput: unknown): Promise<{ customer: Customer; token: string } | null> {
  const email = normaliseEmail(emailInput);
  if (!email) return null;
  const db = await getDb();
  const [customer] = await db.select().from(customers).where(eq(customers.email, email));
  if (!customer || customer.disabledAt) return null;
  return { customer, token: await issueToken(customer.id, 'password_reset', RESET_MINUTES * 60_000) };
}

/** Completes a reset. Receiving the link proves control of the inbox, so it also verifies the address. */
export async function resetPassword(token: string, password: unknown): Promise<Customer> {
  if (typeof password !== 'string') throw new AccountError('Enter a password.', 'invalid');
  const problem = passwordProblem(password);
  if (problem) throw new AccountError(problem, 'invalid');
  const customerId = await consumeToken(token, 'password_reset');
  if (!customerId) throw new AccountError('This reset link is invalid or has expired.', 'token');
  const db = await getDb();
  const [existing] = await db.select().from(customers).where(eq(customers.id, customerId));
  const [customer] = await db
    .update(customers)
    .set({
      passwordHash: await hashPassword(password),
      emailVerifiedAt: existing?.emailVerifiedAt ?? new Date(),
      updatedAt: new Date(),
    })
    .where(eq(customers.id, customerId))
    .returning();
  await revokeAllSessions(customerId);
  await db.update(orders).set({ customerId }).where(and(eq(orders.email, customer!.email), isNull(orders.customerId)));
  return customer!;
}

export async function changePassword(
  customerId: string,
  currentPassword: unknown,
  nextPassword: unknown,
  keepSessionToken?: string,
): Promise<void> {
  const db = await getDb();
  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId));
  if (!customer || !(await verifyPassword(typeof currentPassword === 'string' ? currentPassword : '', customer.passwordHash))) {
    throw new AccountError('Your current password is not correct.', 'credentials');
  }
  if (typeof nextPassword !== 'string') throw new AccountError('Enter a new password.', 'invalid');
  const problem = passwordProblem(nextPassword);
  if (problem) throw new AccountError(problem, 'invalid');
  await db
    .update(customers)
    .set({ passwordHash: await hashPassword(nextPassword), updatedAt: new Date() })
    .where(eq(customers.id, customerId));
  await revokeAllSessions(customerId, keepSessionToken ? hashToken(keepSessionToken) : undefined);
}

/* ------------------------------------------------------------------ *
 * Profile and addresses
 * ------------------------------------------------------------------ */

export async function updateProfile(
  customerId: string,
  input: { firstName?: unknown; lastName?: unknown; phone?: unknown; marketingConsent?: unknown },
): Promise<Customer> {
  const db = await getDb();
  const [current] = await db.select().from(customers).where(eq(customers.id, customerId));
  if (!current) throw new AccountError('Account not found.', 'not_found');
  const consent = typeof input.marketingConsent === 'boolean' ? input.marketingConsent : current.marketingConsent;
  const consentChanged = consent !== current.marketingConsent;
  const [updated] = await db
    .update(customers)
    .set({
      firstName: input.firstName !== undefined ? name(input.firstName) : current.firstName,
      lastName: input.lastName !== undefined ? name(input.lastName) : current.lastName,
      phone: input.phone !== undefined ? name(input.phone).slice(0, 30) || null : current.phone,
      marketingConsent: consent,
      marketingConsentAt: consentChanged ? new Date() : current.marketingConsentAt,
      marketingConsentSource: consentChanged ? (consent ? 'account' : 'account-withdrawn') : current.marketingConsentSource,
      updatedAt: new Date(),
    })
    .where(eq(customers.id, customerId))
    .returning();
  return updated!;
}

export async function listAddresses(customerId: string): Promise<CustomerAddress[]> {
  const db = await getDb();
  return db
    .select()
    .from(customerAddresses)
    .where(eq(customerAddresses.customerId, customerId))
    .orderBy(desc(customerAddresses.isDefault), desc(customerAddresses.updatedAt));
}

/** Creates or updates an address. `addressId` must belong to this customer. */
export async function saveAddress(
  customerId: string,
  input: unknown,
  addressId?: string | null,
): Promise<{ address: CustomerAddress | null; problems: string[] }> {
  const parsed = parseAddress(input);
  if (!parsed.address) return { address: null, problems: parsed.problems };
  const fields = parsed.address;
  const makeDefault = Boolean((input as { isDefault?: unknown })?.isDefault);
  const db = await getDb();

  return db.transaction(async (tx) => {
    const existing = await tx.select().from(customerAddresses).where(eq(customerAddresses.customerId, customerId));
    if (!addressId && existing.length >= 10) return { address: null, problems: ['You can save up to 10 addresses.'] };
    const isDefault = makeDefault || existing.length === 0;
    if (isDefault) {
      await tx.update(customerAddresses).set({ isDefault: false }).where(eq(customerAddresses.customerId, customerId));
    }
    if (addressId) {
      const [updated] = await tx
        .update(customerAddresses)
        .set({ ...fields, isDefault: isDefault || undefined, updatedAt: new Date() })
        // Ownership is part of the predicate: another customer's id matches nothing.
        .where(and(eq(customerAddresses.id, addressId), eq(customerAddresses.customerId, customerId)))
        .returning();
      return updated ? { address: updated, problems: [] } : { address: null, problems: ['Address not found.'] };
    }
    const [created] = await tx
      .insert(customerAddresses)
      .values({ id: newId('adr'), customerId, ...fields, isDefault })
      .returning();
    return { address: created!, problems: [] };
  });
}

export async function deleteAddress(customerId: string, addressId: string): Promise<boolean> {
  const db = await getDb();
  const removed = await db
    .delete(customerAddresses)
    .where(and(eq(customerAddresses.id, addressId), eq(customerAddresses.customerId, customerId)))
    .returning({ id: customerAddresses.id });
  return removed.length > 0;
}

/**
 * Privacy erasure. Removes the account and everything that identifies the
 * person. Orders are kept, as tax law requires, but detached and stripped of
 * the address; the email is replaced with a non-identifying marker.
 */
export async function eraseCustomer(customerId: string): Promise<void> {
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(orders)
      .set({ customerId: null, email: `erased+${customerId}@invalid`, shippingAddress: null, note: '' })
      .where(eq(orders.customerId, customerId));
    await tx.delete(customers).where(eq(customers.id, customerId));
  });
}
