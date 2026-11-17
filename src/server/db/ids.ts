import { createHash, randomBytes } from 'node:crypto';

/** Prefixed, sortable-enough, unguessable ids: `ord_lq3k2x…`. */
export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${randomBytes(9).toString('base64url')}`;
}

/** A bearer token for a cookie, and the hash that is stored instead of it. */
export function newToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');
