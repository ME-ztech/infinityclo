/**
 * Security primitives: sealed cookies, password hashing, CSRF origin checks,
 * rate limiting and log masking.
 *
 * Sessions are stateless sealed cookies (AES-256-GCM). The payload is encrypted
 * and authenticated, so a client can neither read nor forge one, and every
 * session carries its own expiry inside the seal.
 */
import 'server-only';

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { config } from './config';

/* ------------------------------------------------------------------ *
 * Secret
 * ------------------------------------------------------------------ */

let cachedDevSecret: string | null = null;

/**
 * The session secret, or null when sign-in must be refused.
 *
 * Production requires SESSION_SECRET. Development falls back to a random secret
 * persisted under DATA_DIR so sessions survive a restart; that fallback is never
 * taken in production, where a guessable or shared secret would be a vulnerability.
 */
export function sessionSecret(): string | null {
  const configured = config.session.secret;
  if (configured && configured.length >= 32) return configured;
  if (config.isProduction && !process.env.INFNITY_ALLOW_DEV_SECRET) return null;
  if (cachedDevSecret) return cachedDevSecret;
  const file = path.resolve(process.cwd(), config.storage.dataDir, 'dev-session-secret');
  try {
    if (existsSync(file)) {
      cachedDevSecret = readFileSync(file, 'utf8').trim();
    } else {
      cachedDevSecret = randomBytes(48).toString('base64url');
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, cachedDevSecret, { mode: 0o600 });
    }
  } catch {
    cachedDevSecret = randomBytes(48).toString('base64url');
  }
  return cachedDevSecret;
}

function key(purpose: string, secret: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, 'infnity', purpose, 32));
}

/* ------------------------------------------------------------------ *
 * Sealed values
 * ------------------------------------------------------------------ */

interface Envelope<T> {
  readonly v: T;
  /** Expiry, epoch seconds. */
  readonly e: number;
}

/** Encrypts and authenticates `value`. Returns null when no secret is available. */
export function seal<T>(value: T, purpose: string, ttlSeconds: number): string | null {
  const secret = sessionSecret();
  if (!secret) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(purpose, secret), iv);
  const envelope: Envelope<T> = { v: value, e: Math.floor(Date.now() / 1000) + ttlSeconds };
  const body = Buffer.concat([cipher.update(JSON.stringify(envelope), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}

/** Returns the value, or null when the seal is invalid, tampered with or expired. */
export function unseal<T>(sealed: string | undefined | null, purpose: string): T | null {
  const secret = sessionSecret();
  if (!secret || !sealed) return null;
  try {
    const raw = Buffer.from(sealed, 'base64url');
    if (raw.length < 29) return null;
    const decipher = createDecipheriv('aes-256-gcm', key(purpose, secret), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const text = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
    const envelope = JSON.parse(text) as Envelope<T>;
    if (typeof envelope.e !== 'number' || envelope.e < Date.now() / 1000) return null;
    return envelope.v;
  } catch {
    return null;
  }
}

export interface CookieOptions {
  readonly maxAge: number;
  readonly path?: string;
}

/** Attributes every session cookie is set with. */
export function cookieAttributes({ maxAge, path: cookiePath = '/' }: CookieOptions) {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax' as const,
    path: cookiePath,
    maxAge,
  };
}

/* ------------------------------------------------------------------ *
 * Passwords (staff only — customers authenticate with Shopify)
 * ------------------------------------------------------------------ */

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 } as const;

function scrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p }, (error, derived) =>
      error ? reject(error) : resolve(derived),
    );
  });
}

/** `scrypt$<salt>$<hash>`, both base64url. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt);
  return `scrypt$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  // Always do the work, so a missing account costs the same time as a wrong password.
  const [scheme, saltText, hashText] = (stored ?? '').split('$');
  const valid = scheme === 'scrypt' && Boolean(saltText) && Boolean(hashText);
  const salt = valid ? Buffer.from(saltText!, 'base64url') : Buffer.alloc(16);
  const expected = valid ? Buffer.from(hashText!, 'base64url') : Buffer.alloc(SCRYPT.keylen);
  const derived = await scrypt(password, salt);
  return valid && derived.length === expected.length && timingSafeEqual(derived, expected);
}

/** Minimum bar for a staff password. Returns a message, or null when acceptable. */
export function passwordProblem(password: string): string | null {
  if (password.length < 12) return 'Use at least 12 characters.';
  if (password.length > 200) return 'Use 200 characters or fewer.';
  return null;
}

/* ------------------------------------------------------------------ *
 * HMAC
 * ------------------------------------------------------------------ */

export function hmacSha256Base64(secret: string, payload: string | Buffer): string {
  return createHmac('sha256', secret).update(payload).digest('base64');
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/* ------------------------------------------------------------------ *
 * CSRF
 * ------------------------------------------------------------------ */

/**
 * State-changing requests must come from this origin. Session cookies are
 * SameSite=Lax, and this closes the remaining gap by refusing any mutation whose
 * Origin (or Referer) does not match the host that received it.
 */
export function isSameOrigin(request: Request): boolean {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!host) return false;
  const source = request.headers.get('origin') ?? request.headers.get('referer');
  if (!source) return false;
  try {
    return new URL(source).host === host;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Rate limiting
 * ------------------------------------------------------------------ */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
}

/**
 * Fixed-window limiter, per process. It blunts form spam and password guessing
 * on a single instance; a multi-instance deployment should additionally rate
 * limit at the edge (documented in docs/deployment-and-rollback.md).
 */
export function rateLimit(scope: string, identity: string, limit: number, windowSeconds: number): RateLimitResult {
  const now = Date.now();
  const id = `${scope}:${identity}`;
  const bucket = buckets.get(id);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(id, { count: 1, resetAt: now + windowSeconds * 1000 });
    if (buckets.size > 5000) {
      for (const [entry, value] of buckets) if (value.resetAt <= now) buckets.delete(entry);
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export function resetRateLimitsForTesting(): void {
  buckets.clear();
}

/** Best-effort client address for rate-limit keys. Never logged in full. */
export function clientAddress(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request.headers.get('x-real-ip') || 'unknown';
}

/* ------------------------------------------------------------------ *
 * Validation and masking
 * ------------------------------------------------------------------ */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Normalised email, or null when it is not a plausible address. */
export function normaliseEmail(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const email = input.trim().toLowerCase();
  return email.length <= 254 && EMAIL_PATTERN.test(email) ? email : null;
}

/** `j***@example.com` — for logs and audit entries that must not carry full PII. */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 1)}***@${domain}`;
}

/** Trimmed, length-capped plain text with control characters removed. */
export function cleanText(input: unknown, maxLength: number): string {
  if (typeof input !== 'string') return '';
  return input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, maxLength);
}

export function stableHash(value: string): string {
  return createHmac('sha256', 'infnity-id').update(value).digest('hex').slice(0, 24);
}
