/**
 * Starts a Shopify-hosted checkout from the browser's cart identities.
 * The body carries no money; see src/server/commerce/checkout.ts.
 */
import { NextResponse } from 'next/server';

import type { PersistedLine } from '@/lib/cart/storage';
import { getCustomerSession } from '@/server/auth/customer';
import { startCheckout } from '@/server/commerce/checkout';
import { rateLimit } from '@/server/security/rate-limit';
import { contextFromHeaders, isSameOrigin } from '@/server/security/request';

const MAX_LINES = 50;

function parseLine(value: unknown): PersistedLine | null {
  if (typeof value !== 'object' || value === null) return null;
  const line = value as Record<string, unknown>;
  if (typeof line.productSlug !== 'string' || typeof line.variantId !== 'string') return null;
  if (line.productSlug.length > 200 || line.variantId.length > 40) return null;
  const quantity = typeof line.quantity === 'number' ? Math.trunc(line.quantity) : NaN;
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > 10) return null;
  return { productSlug: line.productSlug, variantId: line.variantId, quantity };
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'Cross-origin request refused.' }, { status: 403 });
  }
  const context = contextFromHeaders(request.headers);
  const limited = await rateLimit(`checkout:${context.ipHash ?? 'unknown'}`, 30, 60).catch(
    () => null,
  );
  if (limited && !limited.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Please wait a moment.' },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const rawLines = Array.isArray((body as { lines?: unknown })?.lines)
    ? (body as { lines: unknown[] }).lines.slice(0, MAX_LINES)
    : [];
  const lines = rawLines.map(parseLine).filter((line): line is PersistedLine => line !== null);
  if (lines.length === 0)
    return NextResponse.json({ error: 'Your bag is empty.' }, { status: 400 });

  const customer = await getCustomerSession().catch(() => null);
  const result = await startCheckout(lines, {
    customerAccessToken: customer?.accessToken ?? null,
    buyerIp: context.ip,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, droppedLines: result.droppedLines ?? [] },
      { status: result.status },
    );
  }
  return NextResponse.json({ url: result.url, mode: result.mode });
}
