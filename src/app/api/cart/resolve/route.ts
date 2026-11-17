/**
 * Prices a cart from client-held line identities.
 *
 * The request body carries no money. Everything chargeable is resolved from the
 * catalog server-side, so a modified localStorage value changes nothing about
 * what a cart costs.
 *
 * Alongside the priced cart the response carries:
 *
 *   offers           estimates for live automatic offers (and bundle "add one
 *                    more" nudges). Empty unless such an offer really exists in
 *                    Shopify; the figures are estimates and checkout is final.
 *   recommendations  "you may also like" products, only when the owner has
 *                    switched the cart placement on.
 */
import { NextResponse } from 'next/server';

import { catalogRepository } from '@/data';
import { automaticEstimates, describeOffer } from '@/domain/offers';
import type { Product } from '@/domain/types';
import type { CartOfferSummary } from '@/lib/cart/extras';
import { resolveCart } from '@/lib/cart/resolve';
import type { PersistedCart, PersistedLine } from '@/lib/cart/storage';
import { getSiteContent } from '@/server/cms';
import { listStorefrontOffers } from '@/server/offers';
import { recommendProducts } from '@/server/storefront';

export const dynamic = 'force-dynamic';

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

  let offers: CartOfferSummary[] = [];
  let recommendations: readonly Product[] = [];

  if (cart.lines.length > 0) {
    const [liveOffers, content] = await Promise.all([listStorefrontOffers(), getSiteContent()]);
    const needsCatalog = liveOffers.length > 0 || content.upsell.cart;
    const catalog = needsCatalog ? (await catalogRepository.listProducts()).products : [];
    const bySlug = new Map(catalog.map((product) => [product.slug, product]));

    offers = automaticEstimates(liveOffers, cart.lines, bySlug)
      // A percentage offer that takes nothing off this cart is not worth a line.
      .filter((estimate) => estimate.applies || estimate.unitsShort > 0)
      .map((estimate) => ({
        id: estimate.offer.id,
        kind: estimate.offer.kind,
        title: estimate.offer.title,
        description: describeOffer(estimate.offer),
        applies: estimate.applies,
        savings: estimate.savings,
        unitsShort: estimate.unitsShort,
      }));

    if (content.upsell.cart) {
      const inCart = cart.lines
        .map((line) => bySlug.get(line.productSlug))
        .filter((product): product is Product => product !== undefined);
      recommendations = recommendProducts(catalog, inCart, 4);
    }
  }

  return NextResponse.json({ cart, droppedLines, offers, recommendations });
}
