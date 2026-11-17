// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { defaultContent, normaliseContent, safeHref, safeImageUrl } from './cms';
import { joinWaitlist, subscribe, unsubscribe, listSubscribers, DROP_TRANSITIONS } from './records';
import {
  hashPassword,
  isSameOrigin,
  maskEmail,
  normaliseEmail,
  rateLimit,
  resetRateLimitsForTesting,
  seal,
  unseal,
  verifyPassword,
} from './security';
import { FileStore, KvStore, MemoryStore, setStoreForTesting } from './store';

beforeEach(() => {
  process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-1234';
  setStoreForTesting(new MemoryStore());
  resetRateLimitsForTesting();
});

afterEach(() => {
  setStoreForTesting(null);
  vi.useRealTimers();
});

describe('sealed sessions', () => {
  it('round-trips a value', () => {
    const sealed = seal({ user: 'a@b.co' }, 'admin-session', 60)!;
    expect(sealed).not.toContain('a@b.co');
    expect(unseal(sealed, 'admin-session')).toEqual({ user: 'a@b.co' });
  });

  it('rejects a tampered seal', () => {
    const sealed = seal({ role: 'support' }, 'admin-session', 60)!;
    const flipped = sealed.slice(0, -2) + (sealed.endsWith('A') ? 'B' : 'A') + sealed.slice(-1);
    expect(unseal(flipped, 'admin-session')).toBeNull();
    expect(unseal('not-a-seal', 'admin-session')).toBeNull();
  });

  it('rejects a seal presented for a different purpose', () => {
    const sealed = seal({ id: 1 }, 'customer-session', 60)!;
    expect(unseal(sealed, 'admin-session')).toBeNull();
  });

  it('expires', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-16T00:00:00Z'));
    const sealed = seal({ id: 1 }, 'admin-session', 60)!;
    vi.setSystemTime(new Date('2026-11-16T00:02:00Z'));
    expect(unseal(sealed, 'admin-session')).toBeNull();
  });

  it('refuses to seal in production without a secret', () => {
    delete process.env.SESSION_SECRET;
    vi.stubEnv('NODE_ENV', 'production');
    expect(seal({ id: 1 }, 'admin-session', 60)).toBeNull();
    vi.unstubAllEnvs();
  });
});

describe('passwords', () => {
  it('verifies the right password and rejects the wrong one', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
    expect(await verifyPassword('correct horse battery stapl', hash)).toBe(false);
  });

  it('rejects when no hash is stored', async () => {
    expect(await verifyPassword('anything', null)).toBe(false);
    expect(await verifyPassword('anything', 'plaintext')).toBe(false);
  });
});

describe('request guards', () => {
  const request = (headers: Record<string, string>) =>
    new Request('https://shop.example/api/x', { method: 'POST', headers });

  it('accepts same-origin and refuses cross-origin or origin-less mutations', () => {
    expect(isSameOrigin(request({ host: 'shop.example', origin: 'https://shop.example' }))).toBe(true);
    expect(isSameOrigin(request({ host: 'shop.example', origin: 'https://evil.example' }))).toBe(false);
    expect(isSameOrigin(request({ host: 'shop.example' }))).toBe(false);
    expect(
      isSameOrigin(request({ host: 'shop.example', referer: 'https://shop.example/contact' })),
    ).toBe(true);
  });

  it('rate limits per identity and reports when to retry', () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(rateLimit('login', '1.2.3.4', 3, 60).allowed).toBe(true);
    }
    const blocked = rateLimit('login', '1.2.3.4', 3, 60);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(rateLimit('login', '5.6.7.8', 3, 60).allowed).toBe(true);
  });

  it('normalises and masks email addresses', () => {
    expect(normaliseEmail('  Person@Example.COM ')).toBe('person@example.com');
    expect(normaliseEmail('not-an-email')).toBeNull();
    expect(normaliseEmail(42)).toBeNull();
    expect(maskEmail('person@example.com')).toBe('p***@example.com');
  });
});

describe('document stores', () => {
  it('file store persists, lists and inserts-if-absent exactly once under concurrency', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'infnity-store-'));
    try {
      const store = new FileStore(directory);
      await store.put('offers', 'a', { n: 1 });
      expect(await new FileStore(directory).get('offers', 'a')).toEqual({ n: 1 });

      const results = await Promise.all(
        Array.from({ length: 12 }, (_, index) => store.putIfAbsent('webhook-events', 'evt', { index })),
      );
      expect(results.filter(Boolean)).toHaveLength(1);

      await Promise.all(Array.from({ length: 20 }, (_, index) => store.put('audit', `e${index}`, { index })));
      expect(await store.list('audit')).toHaveLength(20);

      await store.delete('offers', 'a');
      expect(await store.get('offers', 'a')).toBeNull();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('kv store speaks the Redis REST protocol', async () => {
    const calls: unknown[][] = [];
    const fetcher = (async (_url: unknown, init?: RequestInit) => {
      const command = JSON.parse(String(init!.body)) as unknown[];
      calls.push(command);
      const result =
        command[0] === 'HGET'
          ? JSON.stringify({ n: 1 })
          : command[0] === 'HGETALL'
            ? ['a', JSON.stringify({ n: 1 }), 'b', JSON.stringify({ n: 2 })]
            : command[0] === 'HSETNX'
              ? 0
              : 1;
      return new Response(JSON.stringify({ result }), { status: 200 });
    }) as typeof fetch;
    const store = new KvStore('https://kv.example', 'token', fetcher);

    expect(await store.get('offers', 'a')).toEqual({ n: 1 });
    expect(await store.list('offers')).toEqual([{ n: 1 }, { n: 2 }]);
    expect(await store.putIfAbsent('offers', 'a', { n: 3 })).toBe(false);
    await store.put('offers', 'c', { n: 3 });
    expect(calls.at(-1)).toEqual(['HSET', 'infnity:offers', 'c', '{"n":3}']);
  });
});

describe('content', () => {
  it('builds defaults only from brand lines and catalogue photography', () => {
    const content = defaultContent();
    expect(content.statement.headline).toBe('Be the Statement');
    expect(content.upsell).toEqual({ productPage: true, cart: false });
    expect(content.hero.slides.length).toBeGreaterThan(0);
    for (const slide of content.hero.slides) {
      for (const image of slide.images) expect(image.url.startsWith('/products/')).toBe(true);
    }
  });

  it('rejects unsafe links and image sources', () => {
    expect(safeHref('/shop')).toBe('/shop');
    expect(safeHref('https://www.instagram.com/infnity.clo/')).toBe('https://www.instagram.com/infnity.clo/');
    expect(safeHref('javascript:alert(1)', '/shop')).toBe('/shop');
    expect(safeHref('//evil.example', '/shop')).toBe('/shop');
    expect(safeImageUrl('/products/a/01.jpg')).toBe('/products/a/01.jpg');
    // No external host is allowed unless the deployment opts in.
    expect(safeImageUrl('https://cdn.shopify.com/s/files/1/x.jpg')).toBeNull();
    expect(safeImageUrl('https://evil.example/x.jpg')).toBeNull();
    expect(safeImageUrl('/products/../../etc/passwd')).toBeNull();
  });

  it('normalises hostile input without throwing and keeps every section present', () => {
    const content = normaliseContent({
      hero: { autoAdvanceSeconds: 999, slides: [{ images: [{ url: 'https://evil.example/x.jpg' }], title: 'x' }] },
      sections: [{ id: 'newsletter', enabled: false }, { id: 'nope' }, { id: 'hero' }],
      announcement: { enabled: true, text: 'A'.repeat(500), href: 'javascript:alert(1)' },
      statement: { headline: 42 },
    });
    expect(content.hero.autoAdvanceSeconds).toBe(20);
    expect(content.hero.slides).toHaveLength(0);
    expect(content.sections.map((section) => section.id).slice(0, 2)).toEqual(['newsletter', 'hero']);
    expect(content.sections).toHaveLength(8);
    expect(content.sections[0]!.enabled).toBe(false);
    expect(content.announcement.text).toHaveLength(140);
    expect(content.announcement.href).toBe('');
    expect(content.statement.headline).toBe('Be the Statement');
  });
});

describe('consent records', () => {
  it('records a newsletter signup once and treats a repeat as already subscribed', async () => {
    expect((await subscribe('a@example.com', 'footer')).created).toBe(true);
    expect((await subscribe('a@example.com', 'footer')).created).toBe(false);
    const [subscriber] = await listSubscribers();
    expect(subscriber!.consentText).toMatch(/marketing emails/);
    expect(await listSubscribers()).toHaveLength(1);
  });

  it('treats re-subscribing after an unsubscribe as fresh consent', async () => {
    await subscribe('a@example.com', 'footer');
    expect(await unsubscribe('a@example.com')).toBe(true);
    expect(await unsubscribe('a@example.com')).toBe(false);
    expect((await subscribe('a@example.com', 'footer')).created).toBe(true);
    expect((await listSubscribers())[0]!.status).toBe('subscribed');
  });

  it('prevents duplicate waitlist entries per drop', async () => {
    expect((await joinWaitlist('drop_1', 'a@example.com')).created).toBe(true);
    expect((await joinWaitlist('drop_1', 'a@example.com')).created).toBe(false);
    expect((await joinWaitlist('drop_2', 'a@example.com')).created).toBe(true);
  });

  it('only allows the documented drop lifecycle moves', () => {
    expect(DROP_TRANSITIONS.draft).toContain('coming_soon');
    expect(DROP_TRANSITIONS.coming_soon).toContain('early_access');
    expect(DROP_TRANSITIONS.published).not.toContain('draft');
    expect(DROP_TRANSITIONS.archived).toEqual(['draft']);
  });
});
