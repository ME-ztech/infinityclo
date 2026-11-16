/**
 * Shopify webhook endpoint. HMAC-verified over the raw body, deduplicated on
 * X-Shopify-Webhook-Id. See src/server/shopify/webhooks.ts.
 */
import { handleShopifyWebhook } from '@/server/shopify/webhooks';

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const outcome = await handleShopifyWebhook(rawBody, request.headers);
  return new Response(outcome.body, { status: outcome.status, headers: { 'content-type': 'text/plain' } });
}
