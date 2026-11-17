// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cache = vi.hoisted(() => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));
vi.mock('next/cache', () => cache);

import { buildWebhookHandlers } from '@/server/customer/webhook-handlers';
import { createTicket, joinWaitlist, listSubscribers, listTickets, listWaitlist, subscribe } from '@/server/records';
import { hmacSha256Base64 } from '@/server/security';
import { processWebhook, type WebhookReceipt } from '@/server/shopify/webhooks';
import { getStore, MemoryStore, setStoreForTesting } from '@/server/store';

import { POST } from './route';

const SECRET = 'whsec_test_secret';
const SHOP = 'apparelinifinty85.myshopify.com';

function delivery(
  topic: string,
  payload: unknown,
  overrides: { id?: string; signature?: string; shop?: string | null; eventIdOnly?: boolean; secret?: string } = {},
): Request {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const headers = new Headers({
    'content-type': 'application/json',
    'x-shopify-topic': topic,
    'x-shopify-hmac-sha256': overrides.signature ?? hmacSha256Base64(overrides.secret ?? SECRET, body),
  });
  headers.set(overrides.eventIdOnly ? 'x-shopify-event-id' : 'x-shopify-webhook-id', overrides.id ?? `wh_${Math.random().toString(36).slice(2)}`);
  if (overrides.shop !== null) headers.set('x-shopify-shop-domain', overrides.shop ?? SHOP);
  return new Request('https://shop.test/api/webhooks/shopify', { method: 'POST', headers, body });
}

const receipts = () => getStore().list<WebhookReceipt>('webhook-events');

beforeEach(() => {
  setStoreForTesting(new MemoryStore());
  process.env.SHOPIFY_WEBHOOK_SECRET = SECRET;
  delete process.env.SHOPIFY_STORE_DOMAIN;
  cache.revalidateTag.mockReset();
  cache.revalidatePath.mockReset();
});

afterEach(() => vi.restoreAllMocks());

describe('POST /api/webhooks/shopify', () => {
  it('rejects a bad signature with 401 and processes nothing', async () => {
    const response = await POST(delivery('products/update', { id: 1 }, { signature: 'AAAA' }));
    expect(response.status).toBe(401);
    expect(cache.revalidateTag).not.toHaveBeenCalled();
    expect(await receipts()).toHaveLength(0);
  });

  it('rejects a body signed with a different secret', async () => {
    expect((await POST(delivery('products/update', { id: 1 }, { secret: 'someone-elses-secret' }))).status).toBe(401);
  });

  it('rejects a body altered after signing', async () => {
    const signature = hmacSha256Base64(SECRET, JSON.stringify({ id: 1 }));
    expect((await POST(delivery('products/update', { id: 2 }, { signature }))).status).toBe(401);
  });

  it('rejects a delivery for another shop, or with no shop, with 401', async () => {
    expect((await POST(delivery('products/update', { id: 1 }, { shop: 'other-store.myshopify.com' }))).status).toBe(401);
    expect((await POST(delivery('products/update', { id: 1 }, { shop: null }))).status).toBe(401);
    expect(await receipts()).toHaveLength(0);
  });

  it('rejects everything when no signing secret is configured', async () => {
    delete process.env.SHOPIFY_WEBHOOK_SECRET;
    expect((await POST(delivery('products/update', { id: 1 }))).status).toBe(401);
  });

  it('processes a valid catalogue webhook and invalidates the catalogue cache', async () => {
    const response = await POST(delivery('products/update', { id: 42, title: 'Tee' }, { id: 'wh_1' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ result: 'processed' });
    expect(cache.revalidateTag).toHaveBeenCalledWith('catalog', expect.anything());
    expect(cache.revalidatePath).toHaveBeenCalledWith('/shop');
    expect(await receipts()).toEqual([expect.objectContaining({ id: 'wh_1', topic: 'products/update', status: 'processed' })]);
  });

  it.each(['inventory_levels/update', 'products/create', 'products/delete', 'collections/update'])('invalidates the catalogue on %s', async (topic) => {
    expect((await POST(delivery(topic, { id: 1 }))).status).toBe(200);
    expect(cache.revalidateTag).toHaveBeenCalledTimes(1);
  });

  it('skips a redelivery of the same webhook id', async () => {
    await POST(delivery('products/update', { id: 42 }, { id: 'wh_dup' }));
    const second = await POST(delivery('products/update', { id: 42 }, { id: 'wh_dup' }));
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ result: 'duplicate' });
    expect(cache.revalidateTag).toHaveBeenCalledTimes(1);
    expect(await receipts()).toHaveLength(1);
  });

  it('accepts the event id header when no webhook id is sent', async () => {
    expect((await POST(delivery('products/update', { id: 1 }, { id: 'evt_9', eventIdOnly: true }))).status).toBe(200);
    expect((await receipts())[0]!.id).toBe('evt_9');
  });

  it('keeps a receipt for order webhooks without deriving any order state', async () => {
    const response = await POST(delivery('orders/paid', { id: 5001, name: '#1001', email: 'buyer@example.com', total_price: '60.00' }, { id: 'wh_order' }));
    expect(await response.json()).toEqual({ result: 'ignored' });
    const [receipt] = await receipts();
    expect(receipt).toMatchObject({ topic: 'orders/paid', status: 'processed', summary: '5001 #1001' });
    // The receipt carries no customer data and no money.
    expect(JSON.stringify(receipt)).not.toContain('buyer@example.com');
    expect(JSON.stringify(receipt)).not.toContain('60.00');
    expect(cache.revalidateTag).not.toHaveBeenCalled();
  });

  it('returns 400 for a signed but malformed body', async () => {
    expect((await POST(delivery('products/update', '{not json'))).status).toBe(400);
  });

  it('returns 500 when handling fails, then succeeds when Shopify retries the same delivery', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    cache.revalidateTag.mockImplementationOnce(() => {
      throw new Error('cache backend down');
    });
    const first = await POST(delivery('products/update', { id: 42 }, { id: 'wh_retry' }));
    expect(first.status).toBe(500);
    expect(await receipts()).toHaveLength(0);

    const retry = await POST(delivery('products/update', { id: 42 }, { id: 'wh_retry' }));
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual({ result: 'processed' });
    expect(await receipts()).toEqual([expect.objectContaining({ id: 'wh_retry', status: 'processed' })]);
  });
});

describe('privacy webhooks', () => {
  async function seed() {
    await subscribe('gone@example.com', 'footer');
    await subscribe('stays@example.com', 'footer');
    await joinWaitlist('drop_1', 'gone@example.com');
    await joinWaitlist('drop_1', 'stays@example.com');
    const base = { topic: 'other' as const, name: 'X', phone: null, orderNumber: null, message: 'hello there' };
    await createTicket({ ...base, email: 'gone@example.com', customerId: null });
    await createTicket({ ...base, email: 'different@example.com', customerId: '777' });
    await createTicket({ ...base, email: 'stays@example.com', customerId: '888' });
  }

  it('customers/redact deletes that customer’s local records and nobody else’s', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    await seed();
    const response = await POST(delivery('customers/redact', { shop_domain: SHOP, customer: { id: 777, email: 'Gone@Example.com' }, orders_to_redact: [] }));
    expect(response.status).toBe(200);
    expect((await listSubscribers()).map((entry) => entry.email)).toEqual(['stays@example.com']);
    expect((await listWaitlist()).map((entry) => entry.email)).toEqual(['stays@example.com']);
    expect((await listTickets()).map((entry) => entry.email)).toEqual(['stays@example.com']);
    expect(await receipts()).toEqual([expect.objectContaining({ topic: 'customers/redact', status: 'processed' })]);
  });

  it('shop/redact deletes all customer records held locally', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    await seed();
    expect((await POST(delivery('shop/redact', { shop_id: 1, shop_domain: SHOP }))).status).toBe(200);
    expect(await listSubscribers()).toHaveLength(0);
    expect(await listWaitlist()).toHaveLength(0);
    expect(await listTickets()).toHaveLength(0);
  });

  it('customers/data_request is acknowledged and deletes nothing', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    await seed();
    const response = await POST(delivery('customers/data_request', { customer: { id: 1, email: 'gone@example.com' } }));
    expect(await response.json()).toEqual({ result: 'processed' });
    expect(await listSubscribers()).toHaveLength(2);
  });

  it('a redaction that fails midway is retried, not marked done', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let attempts = 0;
    const handlers = {
      'customers/redact': async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('store unavailable');
      },
    };
    const body = JSON.stringify({ customer: { email: 'gone@example.com' } });
    const input = { rawBody: body, signature: hmacSha256Base64(SECRET, body), topic: 'customers/redact', webhookId: 'wh_redact', shopDomain: SHOP };
    expect((await processWebhook(input, handlers, SECRET)).status).toBe(500);
    expect((await processWebhook(input, handlers, SECRET)).result).toBe('processed');
    expect(attempts).toBe(2);
    expect(Object.keys(buildWebhookHandlers(() => undefined))).toContain('shop/redact');
  });
});
