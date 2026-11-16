/**
 * Shopify webhook intake.
 *
 * Three guarantees:
 *
 * 1. **Authenticity.** The HMAC-SHA256 of the *raw* request body, keyed with the
 *    app's signing secret, must match `X-Shopify-Hmac-Sha256`. Compared in
 *    constant time. No secret configured means every delivery is refused.
 * 2. **Idempotency.** Shopify retries, and may deliver the same event twice.
 *    Each delivery is claimed by its `X-Shopify-Webhook-Id` with an atomic
 *    insert; a second arrival of the same id is acknowledged and skipped.
 * 3. **Retry on failure.** If handling throws, the claim is released and a 5xx
 *    is returned so Shopify redelivers. A handled event is never re-run.
 *
 * Shopify stays the system of record: handlers here only invalidate caches and
 * keep a receipt. Order state is always read back from Shopify, never rebuilt
 * from webhook payloads.
 */
import 'server-only';

import { config } from '../config';
import { hmacSha256Base64, safeEqual } from '../security';
import { getStore } from '../store';

export interface WebhookReceipt {
  readonly id: string;
  readonly topic: string;
  readonly shopDomain: string;
  readonly receivedAt: string;
  readonly status: 'processing' | 'processed';
  readonly processedAt: string | null;
  /** Small, non-sensitive summary: resource id and name only. */
  readonly summary: string;
}

export function verifyWebhookSignature(rawBody: string, signature: string | null, secret: string | null): boolean {
  if (!secret || !signature) return false;
  return safeEqual(hmacSha256Base64(secret, rawBody), signature);
}

export type WebhookHandler = (payload: Record<string, unknown>, topic: string) => Promise<void> | void;

export type WebhookOutcome =
  | { status: 401; result: 'invalid_signature' }
  | { status: 400; result: 'malformed' }
  | { status: 200; result: 'processed' | 'duplicate' | 'ignored' }
  | { status: 500; result: 'handler_failed' };

function summarise(payload: Record<string, unknown>): string {
  const id = payload.id ?? payload.admin_graphql_api_id ?? '';
  const name = payload.name ?? payload.title ?? payload.handle ?? '';
  return [id, name].filter(Boolean).join(' ').slice(0, 120);
}

export async function processWebhook(
  input: {
    rawBody: string;
    signature: string | null;
    topic: string | null;
    webhookId: string | null;
    shopDomain: string | null;
  },
  handlers: Readonly<Record<string, WebhookHandler>>,
  secret: string | null = config.shopify.webhookSecret,
): Promise<WebhookOutcome> {
  if (!verifyWebhookSignature(input.rawBody, input.signature, secret)) {
    return { status: 401, result: 'invalid_signature' };
  }
  if (!input.topic || !input.webhookId) return { status: 400, result: 'malformed' };

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(input.rawBody) as Record<string, unknown>;
  } catch {
    return { status: 400, result: 'malformed' };
  }

  const store = getStore();
  const receipt: WebhookReceipt = {
    id: input.webhookId,
    topic: input.topic,
    shopDomain: input.shopDomain ?? '',
    receivedAt: new Date().toISOString(),
    status: 'processing',
    processedAt: null,
    summary: summarise(payload),
  };

  const claimed = await store.putIfAbsent('webhook-events', receipt.id, receipt);
  if (!claimed) return { status: 200, result: 'duplicate' };

  const handler = handlers[input.topic];
  if (!handler) {
    await store.put('webhook-events', receipt.id, { ...receipt, status: 'processed', processedAt: new Date().toISOString() });
    return { status: 200, result: 'ignored' };
  }

  try {
    await handler(payload, input.topic);
    await store.put('webhook-events', receipt.id, { ...receipt, status: 'processed', processedAt: new Date().toISOString() });
    return { status: 200, result: 'processed' };
  } catch (error) {
    // Release the claim so Shopify's retry is processed rather than skipped.
    await store.delete('webhook-events', receipt.id);
    console.error(`[webhook] ${input.topic} ${receipt.id} failed: ${(error as Error).message}`);
    return { status: 500, result: 'handler_failed' };
  }
}
