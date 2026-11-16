import 'server-only';

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const DEV_SECRET = 'infnity-development-secret-not-for-production-use-0000';
let warned = false;

export class SecretNotConfiguredError extends Error {
  constructor() {
    super('APP_SECRET (32+ random characters) must be set in production.');
    this.name = 'SecretNotConfiguredError';
  }
}

/**
 * Root secret for sealing cookies and hashing IPs. Required in production; a
 * fixed, clearly-labelled development value is used locally so the app runs
 * with zero configuration.
 */
export function appSecret(): string {
  const value = process.env.APP_SECRET;
  if (value && value.length >= 32) return value;
  // Any production build (Vercel preview included) must bring its own secret;
  // `ALLOW_DEV_SECRET=true` exists only for local `next start` test runs.
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEV_SECRET !== 'true') {
    throw new SecretNotConfiguredError();
  }
  if (!warned && process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
    warned = true;
    console.warn('[security] APP_SECRET is not set; using the development secret.');
  }
  return DEV_SECRET;
}

export function isAppSecretConfigured(): boolean {
  return Boolean(process.env.APP_SECRET && process.env.APP_SECRET.length >= 32);
}

function derivedKey(purpose: string): Buffer {
  return Buffer.from(hkdfSync('sha256', appSecret(), 'infnity', purpose, 32));
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Hashes an IP for rate limiting and abuse review without storing the address. */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return createHmac('sha256', derivedKey('ip-hash')).update(ip).digest('hex').slice(0, 32);
}

/* ------------------------------------------------------------------ *
 * Sealed values (AES-256-GCM) for cookies
 * ------------------------------------------------------------------ */

export function seal(value: unknown, purpose: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', derivedKey(`seal:${purpose}`), iv);
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

export function unseal<T>(sealed: string | undefined | null, purpose: string): T | null {
  if (!sealed) return null;
  try {
    const raw = Buffer.from(sealed, 'base64url');
    if (raw.length < 29) return null;
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const encrypted = raw.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', derivedKey(`seal:${purpose}`), iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(plaintext.toString('utf8')) as T;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Passwords (scrypt)
 * ------------------------------------------------------------------ */

const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, keyB64] = parts as [string, string, string, string, string, string];
  const expected = Buffer.from(keyB64, 'base64url');
  const key = await scrypt(password.normalize('NFKC'), Buffer.from(saltB64, 'base64url'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/* ------------------------------------------------------------------ *
 * HMAC verification (Shopify webhooks)
 * ------------------------------------------------------------------ */

export function verifyHmacBase64(rawBody: string | Buffer, secret: string, provided: string | null): boolean {
  if (!provided || !secret) return false;
  const computed = createHmac('sha256', secret).update(rawBody).digest();
  let given: Buffer;
  try {
    given = Buffer.from(provided, 'base64');
  } catch {
    return false;
  }
  return given.length === computed.length && timingSafeEqual(given, computed);
}

export function hmacBase64(rawBody: string | Buffer, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('base64');
}
