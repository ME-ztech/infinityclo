/**
 * Shopify webhook endpoint.
 *
 * The raw request body is read exactly once, as text, because the HMAC is
 * computed over those exact bytes. Verification, idempotency and retry
 * behaviour live in `processWebhook`; this route adds one check of its own —
 * the delivery must name this store's permanent domain.
 */
import { revalidatePath, revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';

import { CATALOG_TAG } from '@/data/adapters/shopify/catalog';
import { config } from '@/server/config';
import { buildWebhookHandlers } from '@/server/customer/webhook-handlers';
import { processWebhook } from '@/server/shopify/webhooks';

export const dynamic = 'force-dynamic';

function invalidateCatalog(): void {
  revalidateTag(CATALOG_TAG, 'max');
  revalidatePath('/');
  revalidatePath('/shop');
}

const handlers = buildWebhookHandlers(invalidateCatalog);

const MAX_BODY_BYTES = 2 * 1024 * 1024;

export async function POST(request: Request): Promise<NextResponse> {
  const respond = (status: number, result: string) =>
    NextResponse.json({ result }, { status, headers: { 'cache-control': 'no-store' } });

  const shopDomain = request.headers.get('x-shopify-shop-domain');
  if (!shopDomain || shopDomain.toLowerCase() !== config.shopify.storeDomain.toLowerCase()) {
    return respond(401, 'invalid_signature');
  }

  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) return respond(400, 'malformed');

  const outcome = await processWebhook(
    {
      rawBody,
      signature: request.headers.get('x-shopify-hmac-sha256'),
      topic: request.headers.get('x-shopify-topic'),
      webhookId: request.headers.get('x-shopify-webhook-id') ?? request.headers.get('x-shopify-event-id'),
      shopDomain,
    },
    handlers,
  );
  return respond(outcome.status, outcome.result);
}
