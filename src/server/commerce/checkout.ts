import 'server-only';

import { buildCartPermalink, checkoutAvailability } from '@/domain/checkout';
import { resolveCart } from '@/lib/cart/resolve';
import type { PersistedLine } from '@/lib/cart/storage';
import { checkoutMode, shopifyConfig } from '@/server/shopify/config';
import { ShopifyApiError } from '@/server/shopify/graphql';
import { createStorefrontCart } from '@/server/shopify/storefront';

export type CheckoutResult =
  | { ok: true; url: string; mode: 'storefront' | 'permalink' }
  | { ok: false; status: number; error: string; droppedLines?: readonly PersistedLine[] };

/**
 * Turns browser-held cart identities into a Shopify checkout URL.
 *
 * Everything the client sent is re-resolved from the catalogue here; a variant
 * the catalogue does not know, or one that is sold out, stops the hand-off with
 * a message rather than letting Shopify discover it at the payment step.
 */
export async function startCheckout(
  lines: readonly PersistedLine[],
  context: { customerAccessToken?: string | null; buyerIp?: string | null } = {},
): Promise<CheckoutResult> {
  const mode = checkoutMode();
  const { cart, droppedLines } = await resolveCart({
    id: 'checkout',
    lines,
    updatedAt: new Date().toISOString(),
  });

  if (droppedLines.length > 0) {
    return {
      ok: false,
      status: 409,
      error: 'Some items in your bag are no longer available. Review your bag and try again.',
      droppedLines,
    };
  }

  const availability = checkoutAvailability(cart, mode);
  if (availability.status === 'unavailable') {
    const messages = {
      not_connected: 'Checkout is not connected on this preview. Nothing can be charged.',
      empty_cart: 'Your bag is empty.',
      items_unavailable: 'Remove sold-out items before checking out.',
    } as const;
    return {
      ok: false,
      status: availability.reason === 'not_connected' ? 503 : 409,
      error: messages[availability.reason],
    };
  }

  const checkoutLines = cart.lines.map((line) => ({
    variantId: line.variantId,
    quantity: line.quantity,
  }));

  if (mode === 'permalink') {
    return { ok: true, mode, url: buildCartPermalink(shopifyConfig().storeDomain, checkoutLines) };
  }

  try {
    const created = await createStorefrontCart({
      lines: checkoutLines,
      customerAccessToken: context.customerAccessToken ?? null,
      buyerIp: context.buyerIp ?? null,
    });
    return { ok: true, mode: 'storefront', url: created.checkoutUrl };
  } catch (error) {
    const message =
      error instanceof ShopifyApiError && error.kind === 'user'
        ? error.message
        : 'Checkout is temporarily unavailable. Your bag is saved — please try again in a moment.';
    console.error(`[checkout] ${(error as Error).message}`);
    return { ok: false, status: 502, error: message };
  }
}
