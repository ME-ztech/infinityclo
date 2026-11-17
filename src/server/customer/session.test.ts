// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createLoginAttempt } from '../shopify/customer-account';
import {
  clearSessionIn,
  LOGIN_COOKIE,
  needsRefresh,
  readLoginAttemptFrom,
  readSessionFrom,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  splitIntoChunks,
  writeLoginAttemptTo,
  writeSessionTo,
  type CookieJar,
  type CustomerSession,
} from './session';

class Jar implements CookieJar {
  readonly values = new Map<string, string>();
  readonly options = new Map<string, Record<string, unknown>>();
  get(name: string) {
    const value = this.values.get(name);
    return value === undefined || value === '' ? undefined : { value };
  }
  set(name: string, value: string, options: Record<string, unknown>) {
    this.values.set(name, value);
    this.options.set(name, options);
  }
}

const session = (overrides: Partial<CustomerSession> = {}): CustomerSession => ({
  accessToken: 'shcat_token',
  refreshToken: 'refresh',
  idToken: 'id',
  expiresAt: Date.now() + 3600_000,
  subject: 'customer-1',
  signedInAt: Date.now(),
  ...overrides,
});

beforeEach(() => {
  process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-1234';
});

afterEach(() => {
  vi.useRealTimers();
});

describe('customer session cookie', () => {
  it('round-trips through a sealed, httpOnly, same-site cookie', () => {
    const jar = new Jar();
    expect(writeSessionTo(jar, session())).toBe(true);
    expect(readSessionFrom(jar)?.accessToken).toBe('shcat_token');

    const raw = jar.values.get(SESSION_COOKIE)!;
    expect(raw).not.toContain('shcat_token');
    expect(jar.options.get(SESSION_COOKIE)).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
  });

  it('rejects a tampered cookie', () => {
    const jar = new Jar();
    writeSessionTo(jar, session());
    const raw = jar.values.get(SESSION_COOKIE)!;
    jar.values.set(SESSION_COOKIE, `${raw.slice(0, -4)}AAAA`);
    expect(readSessionFrom(jar)).toBeNull();
  });

  it('rejects a cookie sealed with a different secret', () => {
    const jar = new Jar();
    writeSessionTo(jar, session());
    process.env.SESSION_SECRET = 'another-secret-another-secret-another-12';
    expect(readSessionFrom(jar)).toBeNull();
  });

  it('expires 30 days after sign-in even if the cookie is still present', () => {
    const jar = new Jar();
    const signedInAt = Date.now();
    writeSessionTo(jar, session({ signedInAt }));
    expect(readSessionFrom(jar, signedInAt + (SESSION_MAX_AGE_SECONDS - 60) * 1000)).not.toBeNull();
    expect(readSessionFrom(jar, signedInAt + (SESSION_MAX_AGE_SECONDS + 60) * 1000)).toBeNull();
  });

  it('never extends the 30-day ceiling when a session is rewritten after a refresh', () => {
    const jar = new Jar();
    const signedInAt = Date.now() - (SESSION_MAX_AGE_SECONDS - 100) * 1000;
    expect(writeSessionTo(jar, session({ signedInAt }))).toBe(true);
    expect(Number(jar.options.get(SESSION_COOKIE)?.maxAge)).toBeLessThanOrEqual(100);
    expect(writeSessionTo(jar, session({ signedInAt: Date.now() - (SESSION_MAX_AGE_SECONDS + 5) * 1000 }))).toBe(false);
  });

  it('seals expire on their own', () => {
    vi.useFakeTimers();
    const jar = new Jar();
    const start = Date.now();
    writeSessionTo(jar, session({ signedInAt: start }));
    vi.setSystemTime(start + (SESSION_MAX_AGE_SECONDS + 10) * 1000);
    // Pass a "now" inside the ceiling to prove the seal itself has lapsed.
    expect(readSessionFrom(jar, start)).toBeNull();
  });

  it('splits a large session across cookies and reassembles it', () => {
    const jar = new Jar();
    const big = session({ idToken: 'x'.repeat(6000) });
    expect(writeSessionTo(jar, big)).toBe(true);
    expect(jar.values.has(`${SESSION_COOKIE}.1`)).toBe(true);
    for (const value of jar.values.values()) expect(value.length).toBeLessThanOrEqual(3600);
    expect(readSessionFrom(jar)?.idToken).toBe(big.idToken);
  });

  it('treats a session with a missing chunk as signed out', () => {
    const jar = new Jar();
    writeSessionTo(jar, session({ idToken: 'x'.repeat(6000) }));
    jar.values.delete(`${SESSION_COOKIE}.1`);
    expect(readSessionFrom(jar)).toBeNull();
  });

  it('clears every chunk on sign-out', () => {
    const jar = new Jar();
    writeSessionTo(jar, session({ idToken: 'x'.repeat(6000) }));
    clearSessionIn(jar);
    expect(readSessionFrom(jar)).toBeNull();
    expect(jar.options.get(SESSION_COOKIE)?.maxAge).toBe(0);
    expect(jar.options.get(`${SESSION_COOKIE}.1`)?.maxAge).toBe(0);
  });

  it('refuses to create a session when no secret is available in production', () => {
    const env = process.env as Record<string, string | undefined>;
    const previous = env.NODE_ENV;
    delete env.SESSION_SECRET;
    env.NODE_ENV = 'production';
    try {
      expect(writeSessionTo(new Jar(), session())).toBe(false);
    } finally {
      env.NODE_ENV = previous;
    }
  });

  it('flags a token that is about to lapse', () => {
    expect(needsRefresh(session({ expiresAt: Date.now() + 30_000 }))).toBe(true);
    expect(needsRefresh(session({ expiresAt: Date.now() + 30 * 60_000 }))).toBe(false);
  });

  it('chunks on fixed boundaries', () => {
    expect(splitIntoChunks('abcdefg', 3)).toEqual(['abc', 'def', 'g']);
  });
});

describe('login attempt cookie', () => {
  it('round-trips and is short-lived', () => {
    const jar = new Jar();
    const attempt = createLoginAttempt('/account/orders');
    expect(writeLoginAttemptTo(jar, attempt)).toBe(true);
    expect(readLoginAttemptFrom(jar)).toEqual(attempt);
    expect(Number(jar.options.get(LOGIN_COOKIE)?.maxAge)).toBeLessThanOrEqual(600);
    expect(jar.values.get(LOGIN_COOKIE)).not.toContain(attempt.codeVerifier);
  });

  it('cannot be read as a session, or a session as a login attempt', () => {
    const jar = new Jar();
    writeLoginAttemptTo(jar, createLoginAttempt('/account'));
    jar.values.set(SESSION_COOKIE, jar.values.get(LOGIN_COOKIE)!);
    expect(readSessionFrom(jar)).toBeNull();
  });
});
