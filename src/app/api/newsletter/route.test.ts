// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isValidUnsubscribeToken, signUpForNewsletter, unsubscribePath, unsubscribeToken } from '@/server/customer/newsletter';
import { jsonRequest, TEST_ORIGIN, uniqueAddress } from '@/server/customer/test-helpers';
import { listSubscribers, NEWSLETTER_CONSENT_TEXT } from '@/server/records';
import { resetRateLimitsForTesting } from '@/server/security';
import { MemoryStore, setStoreForTesting } from '@/server/store';

import { POST } from './route';
import { POST as UNSUBSCRIBE } from './unsubscribe/route';

const post = (body: unknown, options = {}) => POST(jsonRequest('/api/newsletter', body, options));

beforeEach(() => {
  setStoreForTesting(new MemoryStore());
  resetRateLimitsForTesting();
  process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-1234';
  delete process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('POST /api/newsletter', () => {
  it('refuses a signup without explicit consent and stores nothing', async () => {
    for (const consent of [undefined, false, 'true', 1, null]) {
      const response = await post({ email: 'fan@example.com', consent });
      expect(response.status).toBe(400);
      expect((await response.json()).code).toBe('consent_required');
    }
    expect(await listSubscribers()).toHaveLength(0);
  });

  it('stores the consent record with the exact wording, time and source', async () => {
    const response = await post({ email: '  Fan@Example.com ', consent: true, source: 'footer' });
    expect(response.status).toBe(200);
    const [subscriber] = await listSubscribers();
    expect(subscriber).toMatchObject({
      email: 'fan@example.com',
      status: 'subscribed',
      consentText: NEWSLETTER_CONSENT_TEXT,
      source: 'footer',
      syncedToShopifyAt: null,
    });
    expect(Date.parse(subscriber!.subscribedAt)).not.toBeNaN();
  });

  it('is idempotent: a repeat signup is acknowledged, not duplicated', async () => {
    await post({ email: 'fan@example.com', consent: true });
    const again = await post({ email: 'FAN@example.com', consent: true });
    expect(again.status).toBe(200);
    expect((await again.json()).message).toMatch(/already/i);
    expect(await listSubscribers()).toHaveLength(1);
  });

  it('rejects an invalid address', async () => {
    expect((await post({ email: 'not-an-email', consent: true })).status).toBe(400);
    expect(await listSubscribers()).toHaveLength(0);
  });

  it('refuses cross-site posts', async () => {
    expect((await post({ email: 'fan@example.com', consent: true }, { origin: 'https://evil.example' })).status).toBe(403);
    expect((await post({ email: 'fan@example.com', consent: true }, { origin: null })).status).toBe(403);
    expect(await listSubscribers()).toHaveLength(0);
  });

  it('gives a bot that fills the honeypot a normal-looking success and stores nothing', async () => {
    const response = await post({ email: 'bot@example.com', consent: true, website: 'https://spam.example' });
    expect(response.status).toBe(200);
    expect(await listSubscribers()).toHaveLength(0);
  });

  it('rate limits repeated attempts from one address', async () => {
    const address = uniqueAddress();
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 10; attempt += 1) {
      statuses.push((await post({ email: `fan${attempt}@example.com`, consent: true }, { address })).status);
    }
    expect(statuses.slice(0, 8).every((status) => status === 200)).toBe(true);
    expect(statuses[9]).toBe(429);
  });

  it('rejects malformed JSON', async () => {
    expect((await post('{not json')).status).toBe(400);
    expect((await post('[]')).status).toBe(400);
  });
});

describe('Shopify consent sync', () => {
  beforeEach(() => {
    process.env.SHOPIFY_ADMIN_ACCESS_TOKEN = 'shpat_test';
  });

  it('creates the Shopify customer with SUBSCRIBED consent and marks the record synced', async () => {
    const bodies: Array<{ query: string; variables: Record<string, any> }> = [];
    const fetcher = (async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      bodies.push(body);
      if (body.query.includes('FindCustomerByEmail')) return Response.json({ data: { customers: { nodes: [] } } });
      return Response.json({ data: { customerCreate: { customer: { id: 'gid://shopify/Customer/1' }, userErrors: [] } } });
    }) as unknown as typeof fetch;

    const result = await signUpForNewsletter('fan@example.com', 'footer', fetcher);
    expect(result.shopify).toBe('synced');
    expect(bodies[1]!.variables.input).toMatchObject({
      email: 'fan@example.com',
      emailMarketingConsent: { marketingState: 'SUBSCRIBED', marketingOptInLevel: 'SINGLE_OPT_IN' },
    });
    expect(Date.parse(bodies[1]!.variables.input.emailMarketingConsent.consentUpdatedAt)).not.toBeNaN();
    expect((await listSubscribers())[0]!.syncedToShopifyAt).not.toBeNull();
  });

  it('updates consent on an existing Shopify customer instead of creating a duplicate', async () => {
    const queries: string[] = [];
    const fetcher = (async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      queries.push(body.query);
      if (body.query.includes('FindCustomerByEmail')) return Response.json({ data: { customers: { nodes: [{ id: 'gid://shopify/Customer/9' }] } } });
      expect(body.variables.input.customerId).toBe('gid://shopify/Customer/9');
      return Response.json({ data: { customerEmailMarketingConsentUpdate: { customer: { id: 'gid://shopify/Customer/9' }, userErrors: [] } } });
    }) as unknown as typeof fetch;

    expect((await signUpForNewsletter('fan@example.com', 'footer', fetcher)).shopify).toBe('synced');
    expect(queries.some((query) => query.includes('customerCreate'))).toBe(false);
  });

  it('keeps the local consent record when Shopify is unreachable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetcher = (async () => new Response('', { status: 503 })) as unknown as typeof fetch;
    const result = await signUpForNewsletter('fan@example.com', 'footer', fetcher);
    expect(result).toMatchObject({ created: true, shopify: 'failed' });
    const [subscriber] = await listSubscribers();
    expect(subscriber).toMatchObject({ email: 'fan@example.com', status: 'subscribed', syncedToShopifyAt: null });
  });

  it('keeps the local consent record when Shopify returns userErrors', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetcher = (async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      if (body.query.includes('FindCustomerByEmail')) return Response.json({ data: { customers: { nodes: [] } } });
      return Response.json({ data: { customerCreate: { customer: null, userErrors: [{ field: ['email'], message: 'Email is invalid' }] } } });
    }) as unknown as typeof fetch;
    expect((await signUpForNewsletter('fan@example.com', 'footer', fetcher)).shopify).toBe('failed');
    expect(await listSubscribers()).toHaveLength(1);
  });

  it('still answers the visitor with success when the sync fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', (async () => new Response('', { status: 401 })) as unknown as typeof fetch);
    const response = await post({ email: 'fan@example.com', consent: true });
    expect(response.status).toBe(200);
    expect(await listSubscribers()).toHaveLength(1);
  });
});

describe('unsubscribe', () => {
  const unsubscribeRequest = (email: string, token: string) =>
    UNSUBSCRIBE(
      new Request(`${TEST_ORIGIN}/api/newsletter/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`, {
        method: 'POST',
        headers: { host: 'shop.test', 'x-forwarded-for': uniqueAddress() },
      }),
    );

  it('unsubscribes with a valid signed link', async () => {
    await post({ email: 'fan@example.com', consent: true });
    const response = await unsubscribeRequest('fan@example.com', unsubscribeToken('fan@example.com')!);
    expect(response.status).toBe(200);
    const [subscriber] = await listSubscribers();
    expect(subscriber!.status).toBe('unsubscribed');
    expect(subscriber!.unsubscribedAt).not.toBeNull();
  });

  it('refuses a forged or mismatched token and changes nothing', async () => {
    await post({ email: 'fan@example.com', consent: true });
    expect((await unsubscribeRequest('fan@example.com', 'forged')).status).toBe(400);
    // A token issued for another address must not work for this one.
    expect((await unsubscribeRequest('fan@example.com', unsubscribeToken('other@example.com')!)).status).toBe(400);
    expect((await listSubscribers())[0]!.status).toBe('subscribed');
  });

  it('builds links whose token verifies', () => {
    const path = unsubscribePath('fan@example.com')!;
    const params = new URL(path, TEST_ORIGIN).searchParams;
    expect(isValidUnsubscribeToken(params.get('email')!, params.get('token'))).toBe(true);
    expect(isValidUnsubscribeToken('fan@example.com', '')).toBe(false);
    expect(isValidUnsubscribeToken('fan@example.com', null)).toBe(false);
  });

  it('treats re-subscribing after an unsubscribe as fresh consent', async () => {
    await post({ email: 'fan@example.com', consent: true });
    await unsubscribeRequest('fan@example.com', unsubscribeToken('fan@example.com')!);
    const again = await post({ email: 'fan@example.com', consent: true });
    expect((await again.json()).message).not.toMatch(/already/i);
    expect((await listSubscribers())[0]!.status).toBe('subscribed');
  });
});
