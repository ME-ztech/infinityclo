/**
 * Cart persistence.
 *
 * Only the *identity* of each line is persisted — product slug, variant id and
 * quantity. Prices and names are re-resolved from the catalog on load, so a
 * price change or a rename can never be served from a stale localStorage entry,
 * and a tampered storage value cannot influence what anything costs.
 */

const STORAGE_KEY = 'infnity.cart.v1';

export interface PersistedLine {
  readonly productSlug: string;
  readonly variantId: string;
  readonly quantity: number;
}

export interface PersistedCart {
  readonly id: string;
  readonly lines: readonly PersistedLine[];
  readonly updatedAt: string;
}

function isPersistedLine(value: unknown): value is PersistedLine {
  if (typeof value !== 'object' || value === null) return false;
  const line = value as Record<string, unknown>;
  return (
    typeof line.productSlug === 'string' &&
    typeof line.variantId === 'string' &&
    typeof line.quantity === 'number' &&
    Number.isInteger(line.quantity) &&
    line.quantity > 0
  );
}

export function createEmptyPersistedCart(): PersistedCart {
  return {
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `cart-${Date.now()}`,
    lines: [],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Reads and validates the stored cart. Anything malformed is discarded rather
 * than partially trusted — a corrupt cart should empty, not throw on render.
 */
export function readPersistedCart(): PersistedCart | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;

    const cart = parsed as Record<string, unknown>;
    if (typeof cart.id !== 'string' || !Array.isArray(cart.lines)) return null;

    return {
      id: cart.id,
      lines: cart.lines.filter(isPersistedLine),
      updatedAt: typeof cart.updatedAt === 'string' ? cart.updatedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function writePersistedCart(cart: PersistedCart): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  } catch {
    // Private browsing or a full quota. The cart still works for this session;
    // losing persistence is not worth breaking the page over.
  }
}

export const CART_STORAGE_KEY = STORAGE_KEY;
