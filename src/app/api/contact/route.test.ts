// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { jsonRequest, uniqueAddress } from '@/server/customer/test-helpers';
import { escapeHtml, sendTicketEmail, ticketEmail } from '@/server/email';
import { getDrop, listTickets, listWaitlist, newDrop, saveDrop, type Ticket } from '@/server/records';
import { resetRateLimitsForTesting } from '@/server/security';
import { MemoryStore, setStoreForTesting } from '@/server/store';

import { POST as WAITLIST } from '../waitlist/route';
import { POST } from './route';

const valid = { name: 'Ada Lovelace', email: 'ada@example.com', topic: 'order', orderNumber: '#1001', message: 'Where is my order please?' };
const post = (body: unknown, options = {}) => POST(jsonRequest('/api/contact', body, options));

beforeEach(() => {
  setStoreForTesting(new MemoryStore());
  resetRateLimitsForTesting();
  for (const name of ['RESEND_API_KEY', 'CONTACT_TO_EMAIL', 'EMAIL_FROM']) delete process.env[name];
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('POST /api/contact', () => {
  it('stores a valid message as an open ticket', async () => {
    const response = await post(valid);
    expect(response.status).toBe(200);
    expect((await response.json()).message).toMatch(/received/i);
    const [ticket] = await listTickets();
    expect(ticket).toMatchObject({ status: 'open', topic: 'order', name: 'Ada Lovelace', email: 'ada@example.com', orderNumber: '#1001', emailed: false, customerId: null });
  });

  it('never takes a customer id from the form', async () => {
    await post({ ...valid, customerId: '999' });
    expect((await listTickets())[0]!.customerId).toBeNull();
  });

  it('reports each invalid field and stores nothing', async () => {
    const response = await post({ name: 'A', email: 'nope', message: 'short', phone: 'call me', orderNumber: '<script>' });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(Object.keys(body.fields).sort()).toEqual(['email', 'message', 'name', 'orderNumber', 'phone']);
    expect(await listTickets()).toHaveLength(0);
  });

  it('falls back to "other" for an unknown topic', async () => {
    await post({ ...valid, topic: 'free-stuff' });
    expect((await listTickets())[0]!.topic).toBe('other');
  });

  it('strips control characters and caps the message length', async () => {
    await post({ ...valid, message: `Hello\u0000 there\u0007${'x'.repeat(5000)}` });
    const [ticket] = await listTickets();
    expect(ticket!.message).not.toMatch(/[\u0000\u0007]/);
    expect(ticket!.message.length).toBeLessThanOrEqual(4000);
  });

  it('silently drops honeypot submissions', async () => {
    const response = await post({ ...valid, website: 'http://spam.example' });
    expect(response.status).toBe(200);
    expect(await listTickets()).toHaveLength(0);
  });

  it('refuses cross-site posts', async () => {
    expect((await post(valid, { origin: 'https://evil.example' })).status).toBe(403);
    expect(await listTickets()).toHaveLength(0);
  });

  it('rate limits one address after five messages', async () => {
    const address = uniqueAddress();
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 7; attempt += 1) statuses.push((await post(valid, { address })).status);
    expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(statuses.slice(5)).toEqual([429, 429]);
    expect(await listTickets()).toHaveLength(5);
  });

  it('emails the team when a provider is configured, with the customer as reply-to', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.CONTACT_TO_EMAIL = 'team@infnity.test';
    process.env.EMAIL_FROM = 'INFNITY <site@infnity.test>';
    const sent: Array<Record<string, any>> = [];
    vi.stubGlobal('fetch', (async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://api.resend.com/emails');
      sent.push(JSON.parse(String(init?.body)));
      return Response.json({ id: 'email_1' });
    }) as unknown as typeof fetch);

    expect((await post(valid)).status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: ['team@infnity.test'], reply_to: 'ada@example.com' });
    expect((await listTickets())[0]!.emailed).toBe(true);
  });

  it('still stores the ticket when the email provider fails', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.CONTACT_TO_EMAIL = 'team@infnity.test';
    process.env.EMAIL_FROM = 'site@infnity.test';
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', (async () => new Response('', { status: 500 })) as unknown as typeof fetch);
    expect((await post(valid)).status).toBe(200);
    expect((await listTickets())[0]).toMatchObject({ emailed: false });
  });
});

describe('ticket email', () => {
  const ticket: Ticket = {
    id: 'tkt_1',
    status: 'open',
    topic: 'other',
    name: '<img src=x onerror=alert(1)>\r\nBcc: evil@example.com',
    email: 'ada@example.com',
    phone: null,
    orderNumber: null,
    message: '<script>alert("x")</script> & more',
    customerId: null,
    emailed: false,
    createdAt: '',
    updatedAt: '',
    notes: [],
  };

  it('escapes all user content in the HTML body', () => {
    const { html } = ticketEmail(ticket);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
    expect(escapeHtml(`<a href="x">'&`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
  });

  it('keeps line breaks out of the subject (header injection)', () => {
    expect(ticketEmail(ticket).subject).not.toMatch(/[\r\n]/);
  });

  it('sends nothing when no provider is configured', async () => {
    const fetcher = vi.fn();
    expect(await sendTicketEmail(ticket, fetcher as unknown as typeof fetch)).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('POST /api/waitlist', () => {
  const join = (body: unknown, options = {}) => WAITLIST(jsonRequest('/api/waitlist', body, options));

  async function openDrop(stage: 'draft' | 'coming_soon' | 'early_access' | 'published' = 'coming_soon', waitlistEnabled = true) {
    const drop = await saveDrop({ ...newDrop('Next drop', 'owner@test'), stage, waitlistEnabled });
    return drop.id;
  }

  it('adds a consenting address to an open waitlist', async () => {
    const dropId = await openDrop();
    const response = await join({ email: 'fan@example.com', dropId, consent: true });
    expect(response.status).toBe(200);
    expect(await listWaitlist(dropId)).toHaveLength(1);
  });

  it('acknowledges a duplicate signup without adding a second entry', async () => {
    const dropId = await openDrop('early_access');
    await join({ email: 'fan@example.com', dropId, consent: true });
    const again = await join({ email: 'Fan@Example.com', dropId, consent: true });
    expect(again.status).toBe(200);
    expect((await again.json()).message).toMatch(/already/i);
    expect(await listWaitlist(dropId)).toHaveLength(1);
  });

  it('keeps waitlists for different drops separate', async () => {
    const first = await openDrop();
    const second = await openDrop();
    await join({ email: 'fan@example.com', dropId: first, consent: true });
    await join({ email: 'fan@example.com', dropId: second, consent: true });
    expect(await listWaitlist(first)).toHaveLength(1);
    expect(await listWaitlist(second)).toHaveLength(1);
  });

  it('requires consent', async () => {
    const dropId = await openDrop();
    const response = await join({ email: 'fan@example.com', dropId });
    expect(response.status).toBe(400);
    expect(await listWaitlist(dropId)).toHaveLength(0);
  });

  it('refuses an unknown drop', async () => {
    expect((await join({ email: 'fan@example.com', dropId: 'drop_missing', consent: true })).status).toBe(404);
    expect((await join({ email: 'fan@example.com', dropId: '../../etc', consent: true })).status).toBe(404);
    expect((await join({ email: 'fan@example.com', consent: true })).status).toBe(404);
  });

  it.each([
    ['a draft', 'draft', true],
    ['a published drop', 'published', true],
    ['a drop with its waitlist switched off', 'coming_soon', false],
  ] as const)('refuses %s', async (_name, stage, enabled) => {
    const dropId = await openDrop(stage, enabled);
    expect((await join({ email: 'fan@example.com', dropId, consent: true })).status).toBe(404);
    expect(await listWaitlist(dropId)).toHaveLength(0);
    expect(await getDrop(dropId)).not.toBeNull();
  });
});
