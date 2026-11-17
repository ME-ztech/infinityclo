/**
 * Prices a cart from client-held line identities.
 *
 * The request body carries no money. Everything chargeable is resolved from the
 * catalog server-side, so a modified localStorage value changes nothing about
 * what a cart costs.
 */
import { NextResponse } from 'next/server';

import { catalogRepository } from '@/data';
import { primaryMedia, fromPrice, isSoldOut } from '@/domain/product';
import { estimatedTotalSaving, previewOffers } from '@/domain/promotions';
import { resolveCart } from '@/lib/cart/resolve';
import { getSettings } from '@/server/content/cms';
import { livePromotions } from '@/server/promotions';
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

  // Estimates from LIVE (Shopify-backed) promotions only; Shopify's checkout is final.
  const promotions = await livePromotions();
  const offers = previewOffers(
    promotions,
    cart.lines.map((line) => ({
      productSlug: line.productSlug,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      compareAtUnitPrice: line.compareAtUnitPrice,
    })),
  );
  const estimatedSavingCents = estimatedTotalSaving(offers, promotions);

  // Cart upsell is an owner switch (off by default); suggestions are links, never auto-added.
  const settings = await getSettings();
  let upsell: Array<{ slug: string; name: string; price: unknown; image: { url: string; alt: string } | null }> = [];
  if (settings.cartUpsellEnabled && cart.lines.length > 0) {
    const inCart = new Set(cart.lines.map((line) => line.productSlug));
    const { products } = await catalogRepository.listProducts({ sort: 'featured' });
    upsell = products
      .filter((product) => !inCart.has(product.slug) && !isSoldOut(product))
      .slice(0, 3)
      .map((product) => {
        const media = primaryMedia(product);
        return { slug: product.slug, name: product.name, price: fromPrice(product), image: media ? { url: media.url, alt: media.alt } : null };
      });
  }

  return NextResponse.json({ cart, droppedLines, offers, estimatedSavingCents, upsell });
}
