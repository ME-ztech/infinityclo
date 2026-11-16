import 'server-only';

import { eq, sql } from 'drizzle-orm';
import { revalidatePath, revalidateTag } from 'next/cache';

import { CATALOG_CACHE_TAG } from '@/data/adapters/shopify/catalog';
import { getDb } from '@/server/db/client';
import { subscribers, webhookEvents } from '@/server/db/schema';
import { sha256Hex, verifyHmacBase64 } from '@/server/security/crypto';

import { shopifyConfig } from './config';

/**
 * Shopify webhook handling.
 *
 *   1. Verify X-Shopify-Hmac-SHA256 over the RAW body with the app secret.
 *   2. Claim the delivery by inserting X-Shopify-Webhook-Id into the ledger
 *      (primary key) — a replayed or retried delivery finds the row and is
 *      acknowledged without being processed twice.
 *   3. Process: our handlers are idempotent anyway (cache revalidation, consent
 *      mirroring), so a retry after a failure is safe.
 *   4. Respond quickly; Shopify retries non-2xx up to 8 times over 4 hours.
 */

export type WebhookOutcome =
  | { status: 401; body: string }
  | { status: 400; body: string }
  | { status: 200; body: 'processed' | 'duplicate' | 'ignored' }
  | { status: 500; body: string };

export const HANDLED_TOPICS = [
  'products/create',
  'products/update',
  'products/delete',
  'inventory_levels/update',
  'collections/update',
  'orders/create',
  'orders/updated',
  'orders/paid',
  'orders/cancelled',
  'fulfillments/create',
  'fulfillments/update',
  'refunds/create',
  'customers/create',
  'customers/update',
  'customers/data_request',
  'customers/redact',
  'shop/redact',
  'app/uninstalled',
] as const;

export async function handleShopifyWebhook(rawBody: string, headers: Headers): Promise<WebhookOutcome> {
  const secret = shopifyConfig().webhookSecret;
  if (!secret) return { status: 401, body: 'Webhook secret not configured' };
  if (!verifyHmacBase64(rawBody, secret, headers.get('x-shopify-hmac-sha256'))) {
    return { status: 401, body: 'Invalid signature' };
  }

  const webhookId = headers.get('x-shopify-webhook-id');
  const topic = headers.get('x-shopify-topic');
  if (!webhookId || !topic) return { status: 400, body: 'Missing webhook headers' };

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return { status: 400, body: 'Body is not JSON' };
  }

  const db = await getDb();
  const claimed = await db
    .insert(webhookEvents)
    .values({
      webhookId,
      eventId: headers.get('x-shopify-event-id'),
      topic,
      shopDomain: headers.get('x-shopify-shop-domain'),
      resourceId: payload.id !== undefined ? String(payload.id) : null,
      payloadDigest: sha256Hex(rawBody),
    })
    .onConflictDoNothing()
    .returning({ webhookId: webhookEvents.webhookId });

  if (claimed.length === 0) {
    // Seen before. If the earlier attempt failed, process again (handlers are idempotent).
    const [existing] = await db.select().from(webhookEvents).where(eq(webhookEvents.webhookId, webhookId)).limit(1);
    if (existing?.status === 'processed' || existing?.status === 'ignored') return { status: 200, body: 'duplicate' };
    await db
      .update(webhookEvents)
      .set({ attempts: sql`${webhookEvents.attempts} + 1` })
      .where(eq(webhookEvents.webhookId, webhookId));
  }

  try {
    const handled = await processTopic(topic, payload);
    await db
      .update(webhookEvents)
      .set({ status: handled ? 'processed' : 'ignored', processedAt: new Date(), error: null })
      .where(eq(webhookEvents.webhookId, webhookId));
    return { status: 200, body: handled ? 'processed' : 'ignored' };
  } catch (error) {
    await db
      .update(webhookEvents)
      .set({ status: 'failed', error: (error as Error).message.slice(0, 500) })
      .where(eq(webhookEvents.webhookId, webhookId));
    return { status: 500, body: 'Processing failed; Shopify will retry' };
  }
}

/** Returns false for topics we acknowledge but do not act on. */
export async function processTopic(topic: string, payload: Record<string, unknown>): Promise<boolean> {
  switch (topic) {
    case 'products/create':
    case 'products/update':
    case 'products/delete':
    case 'inventory_levels/update':
    case 'collections/update': {
      safeRevalidateTag(CATALOG_CACHE_TAG);
      const handle = typeof payload.handle === 'string' ? payload.handle : null;
      safeRevalidatePath(handle ? `/products/${handle}` : '/shop');
      safeRevalidatePath('/');
      return true;
    }
    case 'customers/update': {
      // Mirror an unsubscribe made in Shopify (e.g. from a Shopify marketing email footer).
      const consent = payload.email_marketing_consent as { state?: string } | undefined;
      const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : null;
      if (email && consent?.state === 'unsubscribed') {
        const db = await getDb();
        await db
          .update(subscribers)
          .set({ status: 'unsubscribed', unsubscribedAt: new Date(), updatedAt: new Date() })
          .where(eq(subscribers.email, email));
      }
      return true;
    }
    case 'customers/redact': {
      // Mandatory privacy webhook: erase app-held personal data for this customer.
      const customer = payload.customer as { email?: string } | undefined;
      const email = customer?.email?.toLowerCase();
      if (email) {
        const db = await getDb();
        await db.delete(subscribers).where(eq(subscribers.email, email));
        await db.execute(sql`DELETE FROM waitlist_entries WHERE email = ${email}`);
        await db.execute(sql`UPDATE messages SET name = '[redacted]', email = '[redacted]', body = '[redacted]' WHERE email = ${email}`);
        await db.execute(sql`UPDATE community_posts SET submitter_email = NULL WHERE submitter_email = ${email}`);
      }
      return true;
    }
    case 'customers/data_request':
    case 'shop/redact':
      // Logged in the ledger for the owner to action; app data is exportable from Admin → Marketing.
      return true;
    case 'orders/create':
    case 'orders/updated':
    case 'orders/paid':
    case 'orders/cancelled':
    case 'fulfillments/create':
    case 'fulfillments/update':
    case 'refunds/create':
    case 'customers/create':
      // Orders are read live from Shopify; the ledger row is the activity record.
      safeRevalidatePath('/admin');
      return true;
    default:
      return false;
  }
}

function safeRevalidateTag(tag: string) {
  try {
    revalidateTag(tag, { expire: 0 });
  } catch {
    // Outside a Next.js request (unit tests) there is no cache to revalidate.
  }
}

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // As above.
  }
}
