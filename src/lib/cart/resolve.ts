/**
 * Resolves persisted cart identities into a fully priced cart.
 *
 * This runs on the server. The client sends only slugs, variant ids and
 * quantities; every price, name and image is looked up from the catalog here.
 * That is what makes the cart tamper-proof today and what lets Phase 2 move
 * cart ownership server-side without changing the client contract.
 */
import { catalogRepository } from '@/data';
import { addMoney, money, multiplyMoney } from '@/domain/money';
import { mediaById, primaryMedia } from '@/domain/product';
import type { Cart, CartLine, CurrencyCode } from '@/domain/types';
import type { PersistedCart, PersistedLine } from './storage';

const MAX_QUANTITY_PER_LINE = 10;

export interface ResolvedCart {
  readonly cart: Cart;
  /**
   * Lines that referenced a product or variant that no longer exists. The UI
   * tells the customer what was dropped instead of silently shrinking the cart.
   */
  readonly droppedLines: readonly PersistedLine[];
}

export function lineId(productSlug: string, variantId: string): string {
  return `${productSlug}::${variantId}`;
}

export async function resolveCart(
  persisted: PersistedCart,
  currency: CurrencyCode = 'CAD',
): Promise<ResolvedCart> {
  const slugs = [...new Set(persisted.lines.map((line) => line.productSlug))];
  const products = await catalogRepository.getProductsBySlugs(slugs);
  const bySlug = new Map(products.map((product) => [product.slug, product]));

  const lines: CartLine[] = [];
  const droppedLines: PersistedLine[] = [];

  for (const line of persisted.lines) {
    const product = bySlug.get(line.productSlug);
    const variant = product?.variants.find((v) => v.id === line.variantId);

    if (!product || !variant) {
      droppedLines.push(line);
      continue;
    }

    const quantity = Math.min(Math.max(1, Math.trunc(line.quantity)), MAX_QUANTITY_PER_LINE);

    lines.push({
      id: lineId(product.slug, variant.id),
      productSlug: product.slug,
      variantId: variant.id,
      quantity,
      productName: product.name,
      variantTitle: variant.title,
      unitPrice: variant.price,
      compareAtUnitPrice: variant.compareAtPrice,
      media: mediaById(product, variant.mediaId) ?? primaryMedia(product),
      availability: variant.availability,
    });
  }

  const subtotal = lines.reduce(
    (total, line) => addMoney(total, multiplyMoney(line.unitPrice, line.quantity)),
    money(0, currency),
  );

  return {
    cart: {
      id: persisted.id,
      lines,
      currency,
      subtotal,
      updatedAt: persisted.updatedAt,
    },
    droppedLines,
  };
}

export function cartLineCount(cart: Cart): number {
  return cart.lines.reduce((total, line) => total + line.quantity, 0);
}

export { MAX_QUANTITY_PER_LINE };
