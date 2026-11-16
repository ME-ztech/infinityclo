/**
 * Integration tests for the server layer against a real in-memory PostgreSQL
 * (PGlite) with the production migrations applied. No Shopify network calls
 * are made: Shopify-dependent paths are exercised for their refusal behaviour,
 * and the Admin/Storefront mappings are covered in shopify.test.ts with mocks.
 */
// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

import { eq } from 'drizzle-orm';

import { approvePromotionFixture } from '@/test/promotion-fixture';

import { audit, recentAudit } from './audit';
import { attemptLogin, createStaffUser, passwordProblem } from './auth/staff';
import { approvedPosts, ensureCommunitySeed, moderate, sniffImageType, submitPost } from './community';
import { getCms, saveCms, VersionConflictError } from './content/cms';
import { getDb } from './db/client';
import { subscribers, webhookEvents } from './db/schema';
import { joinWaitlist, saveDrop } from './drops';
import { createMessage, listMessages, updateMessage } from './messages';
import { subscribe, unsubscribeByToken } from './newsletter';
import { approve, listPromotions, livePromotions, publish, saveDraft } from './promotions';
import { hmacBase64 } from './security/crypto';
import { rateLimit } from './security/rate-limit';
import { handleShopifyWebhook } from './shopify/webhooks';

const ctx = { ip: '203.0.113.9', ipHash: 'iphash', userAgent: 'vitest', isHttps: true, origin: null, host: null };
const owner = { id: null, email: 'owner@example.com' };

beforeAll(async () => {
  await getDb();
});

describe('staff authentication', () => {
  it('enforces the password policy', () => {
    expect(passwordProblem('short1')).toMatch(/12/);
    expect(passwordProblem('longbutnodigits')).toMatch(/number/);
    expect(passwordProblem('a-long-pass-123')).toBeNull();
  });

  it('signs in with the right password and refuses the wrong one', async () => {
    await createStaffUser({ email: 'Ops@Example.com', name: 'Ops', role: 'operations', password: 'correct-horse-42' }, null);
    expect((await attemptLogin('ops@example.com', 'wrong-password-1', ctx)).ok).toBe(false);
    const result = await attemptLogin('OPS@example.com', 'correct-horse-42', ctx);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.token.length).toBeGreaterThan(30);
  });

  it('locks an account after five failed attempts, even with the right password afterwards', async () => {
    await createStaffUser({ email: 'lock@example.com', name: 'Lock', role: 'support', password: 'right-password-9' }, null);
    for (let i = 0; i < 5; i += 1) await attemptLogin('lock@example.com', `nope-nope-${i}x`, { ...ctx, ipHash: `lock-${i}` });
    const after = await attemptLogin('lock@example.com', 'right-password-9', { ...ctx, ipHash: 'lock-final' });
    expect(after).toEqual({ ok: false, reason: 'locked' });
  });

  it('does not reveal whether an account exists', async () => {
    expect(await attemptLogin('ghost@example.com', 'whatever-123456', { ...ctx, ipHash: 'ghost' })).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('rate limiting', () => {
  it('allows up to the limit within a window and refuses beyond it', async () => {
    const results = [];
    for (let i = 0; i < 4; i += 1) results.push((await rateLimit('test:key', 3, 60)).allowed);
    expect(results).toEqual([true, true, true, false]);
  });
});

describe('audit log', () => {
  it('masks secret-shaped metadata', async () => {
    await audit({ actor: owner, action: 'test.mask', summary: 'mask', metadata: { password: 'x', nested: { accessToken: 'y' }, safe: 'z' } });
    const [entry] = (await recentAudit(5)).filter((row) => row.action === 'test.mask');
    expect(entry?.metadata).toEqual({ password: '[redacted]', nested: { accessToken: '[redacted]' }, safe: 'z' });
  });
});

describe('promotions lifecycle', () => {
  it('seeds the owner-note drafts as drafts, never live', async () => {
    const all = await listPromotions();
    expect(all.map((p) => p.status)).toEqual(expect.arrayContaining(['draft']));
    expect(all.every((p) => p.status === 'draft')).toBe(true);
    expect(all.some((p) => p.config.kind === 'percentage' && p.config.percent === 10)).toBe(true);
    expect(await livePromotions()).toEqual([]);
  });

  it('refuses approval without a margin acknowledgement or with undecided values', async () => {
    const bundle = (await listPromotions()).find((p) => p.config.kind === 'bundle')!;
    await expect(approve(bundle.id, false, owner)).rejects.toThrow(/margin/);
    await expect(approve(bundle.id, true, owner)).rejects.toThrow(/percentage/);
  });

  it('approves a complete draft, but cannot publish it without the Shopify Admin API', async () => {
    const id = await saveDraft(null, 'Test bundle', approvePromotionFixture, owner);
    await approve(id, true, owner);
    await expect(publish(id, owner)).rejects.toThrow(/Admin API/);
    expect(await livePromotions()).toEqual([]);
  });
});

describe('CMS', () => {
  it('serves defaults until saved, then saved content, and rejects stale versions', async () => {
    const first = await getCms('announcement');
    expect(first.version).toBe(0);
    await saveCms('announcement', { enabled: true, text: 'Restock this Friday', href: '/shop' }, 0, owner);
    const second = await getCms('announcement');
    expect(second.value.text).toBe('Restock this Friday');
    await expect(saveCms('announcement', { enabled: false, text: '', href: null }, 0, owner)).rejects.toBeInstanceOf(VersionConflictError);
  });

  it('rejects images from hosts the site does not serve', async () => {
    const hero = await getCms('hero');
    const bad = structuredClone(hero.value);
    bad.slides[0]!.images[0]!.url = 'https://evil.example.com/x.jpg';
    await expect(saveCms('hero', bad, hero.version, owner)).rejects.toThrow();
  });
});

describe('newsletter consent', () => {
  it('records express consent and honours unsubscribe', async () => {
    const outcome = await subscribe({ email: 'Fan@Example.com', source: 'test', consentText: 'consent', ipHash: null, origin: 'https://x' });
    // No email provider in tests → recorded as subscribed with consent evidence.
    expect(outcome).toBe('subscribed');
    const db = await getDb();
    const [row] = await db.select().from(subscribers).where(eq(subscribers.email, 'fan@example.com'));
    expect(row?.consentText).toBe('consent');
    expect(await subscribe({ email: 'fan@example.com', source: 'test', consentText: 'consent', ipHash: null, origin: 'https://x' })).toBe('already_subscribed');
    expect(await unsubscribeByToken('not-a-token')).toBe(false);
  });
});

describe('drops and waitlists', () => {
  it('only accepts sign-ups for teaser drops, without duplicates', async () => {
    await saveDrop(
      null,
      {
        slug: 'next-drop',
        name: 'Next drop',
        status: 'draft',
        headline: null,
        body: null,
        mediaUrl: null,
        mediaAlt: null,
        releaseAt: null,
        releaseConfirmed: false,
        shopifyProductHandle: null,
        waitlistEnabled: true,
      },
      owner,
    );
    expect(await joinWaitlist({ slug: 'next-drop', email: 'a@example.com', ipHash: null })).toBe('closed');
    const db = await getDb();
    await db.execute(`UPDATE drops SET status = 'coming_soon' WHERE slug = 'next-drop'`);
    expect(await joinWaitlist({ slug: 'next-drop', email: 'A@example.com', ipHash: null })).toBe('joined');
    expect(await joinWaitlist({ slug: 'next-drop', email: 'a@example.com', ipHash: null })).toBe('already');
  });

  it('refuses a confirmed release without a date', async () => {
    await expect(
      saveDrop(null, { slug: 'x-drop', name: 'X drop', status: 'coming_soon', headline: null, body: null, mediaUrl: null, mediaAlt: null, releaseAt: null, releaseConfirmed: true, shopifyProductHandle: null, waitlistEnabled: true }, owner),
    ).rejects.toThrow(/release date/);
  });
});

describe('community moderation', () => {
  it('imports the legacy wall as approved, once', async () => {
    await ensureCommunitySeed();
    await ensureCommunitySeed();
    const posts = await approvedPosts(100);
    expect(posts.length).toBe(34);
  });

  it('keeps submissions private until approved and validates uploads by content', async () => {
    expect(sniffImageType(new TextEncoder().encode('<svg onload=alert(1)>'))).toBeNull();
    await expect(
      submitPost({ handle: 'x', caption: null, email: 'x@example.com', instagramUrl: null, image: new TextEncoder().encode('GIF89a'), ipHash: null }),
    ).rejects.toThrow(/JPEG, PNG or WebP/);
    const id = await submitPost({ handle: 'fan', caption: 'fit', email: 'fan@example.com', instagramUrl: 'https://www.instagram.com/p/abc/', image: null, ipHash: null });
    expect((await approvedPosts(100)).some((post) => post.id === id)).toBe(false);
    await expect(moderate(id, { status: 'approved' }, owner)).rejects.toThrow(/Attach the photo/);
    await moderate(id, { status: 'approved', imageUrl: 'https://cdn.shopify.com/s/files/1/0605/7069/7948/files/IMG_2143.jpg' }, owner);
    expect((await approvedPosts(100)).some((post) => post.id === id)).toBe(true);
  });
});

describe('inbox', () => {
  it('stores messages and appends staff notes', async () => {
    const id = await createMessage({ kind: 'return', name: 'A', email: 'a@example.com', orderNumber: '#1001', subject: null, body: 'Too big', ipHash: null });
    await updateMessage(id, { status: 'open', note: 'Checked policy: within 10 days' }, owner);
    const open = await listMessages(['open']);
    const message = open.find((m) => m.id === id);
    expect(message?.notes[0]?.text).toMatch(/10 days/);
  });
});

describe('Shopify webhooks', () => {
  const secret = 'whsec_test_secret';
  const body = JSON.stringify({ id: 123, handle: 'infnity-crew-socks' });
  const headersFor = (hmac: string, id = 'wh-1') =>
    new Headers({
      'x-shopify-hmac-sha256': hmac,
      'x-shopify-webhook-id': id,
      'x-shopify-topic': 'products/update',
      'x-shopify-shop-domain': 'apparelinifinty85.myshopify.com',
    });

  it('rejects a forged signature', async () => {
    process.env.SHOPIFY_WEBHOOK_SECRET = secret;
    const outcome = await handleShopifyWebhook(body, headersFor(hmacBase64(body, 'wrong-secret')));
    expect(outcome.status).toBe(401);
  });

  it('processes a valid delivery once and acknowledges replays without reprocessing', async () => {
    process.env.SHOPIFY_WEBHOOK_SECRET = secret;
    const signature = hmacBase64(body, secret);
    expect(await handleShopifyWebhook(body, headersFor(signature))).toEqual({ status: 200, body: 'processed' });
    expect(await handleShopifyWebhook(body, headersFor(signature))).toEqual({ status: 200, body: 'duplicate' });
    const db = await getDb();
    const rows = await db.select().from(webhookEvents).where(eq(webhookEvents.webhookId, 'wh-1'));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('processed');
  });

  it('rejects a body altered after signing', async () => {
    process.env.SHOPIFY_WEBHOOK_SECRET = secret;
    const signature = hmacBase64(body, secret);
    const tampered = body.replace('123', '124');
    expect((await handleShopifyWebhook(tampered, headersFor(signature, 'wh-2'))).status).toBe(401);
  });
});
