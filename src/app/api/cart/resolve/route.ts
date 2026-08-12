/**
 * Prices a cart from client-held line identities.
 *
 * The request body carries no money. Everything chargeable is resolved from the
 * catalog server-side, so a modified localStorage value changes nothing about
 * what a cart costs.
 */
import { NextResponse } from 'next/server';

import { resolveCart } from '@/lib/cart/resolve';
import type { PersistedCart, PersistedLine } from '@/lib/cart/storage';

const MAX_LINES = 50;

function parseLine(value: unknown): PersistedLine | null {
  if (typeof value !== 'object' || value === null) return null;
  const line = value as Record<string, unknown>;
  if (typeof line.productSlug !== 'string' || typeof line.variantId !== 'string') return null;
  const quantity = typeof line.quantity === 'number' ? Math.trunc(line.quantity) : NaN;
  if (!Number.isFinite(quantity) || quantity < 1) return null;
  return { productSlug: line.productSlug, variantId: line.variantId, quantity };
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Expected an object.' }, { status: 400 });
  }

  const payload = body as Record<string, unknown>;
  const rawLines = Array.isArray(payload.lines) ? payload.lines.slice(0, MAX_LINES) : [];

  const persisted: PersistedCart = {
    id: typeof payload.id === 'string' ? payload.id : 'anonymous',
    lines: rawLines.map(parseLine).filter((line): line is PersistedLine => line !== null),
    updatedAt: new Date().toISOString(),
  };

  const { cart, droppedLines } = await resolveCart(persisted);
  return NextResponse.json({ cart, droppedLines });
}
