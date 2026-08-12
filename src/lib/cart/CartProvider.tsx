'use client';

/**
 * Cart state.
 *
 * The persisted cart (slugs, variant ids, quantities) is read through
 * `useSyncExternalStore` from `./store`, so localStorage is treated as the
 * external system it is and hydration is exact: the server snapshot is an empty
 * cart, and the first client render matches it before swapping to real data.
 *
 * Prices never come from storage. Whenever the persisted cart changes, it is
 * re-priced server-side via `/api/cart/resolve`, so a tampered or stale
 * localStorage value cannot influence what anything costs.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import { money } from '@/domain/money';
import type { Cart } from '@/domain/types';
import { track } from '@/lib/analytics';
import { getServerSnapshot, getSnapshot, setPersistedCart, subscribe } from './store';
import type { PersistedLine } from './storage';

const EMPTY_CART: Cart = {
  id: 'pending',
  lines: [],
  currency: 'CAD',
  subtotal: money(0, 'CAD'),
  updatedAt: '',
};

export interface CartContextValue {
  readonly cart: Cart;
  readonly lineCount: number;
  readonly isHydrated: boolean;
  readonly isPending: boolean;
  readonly isDrawerOpen: boolean;
  openDrawer(): void;
  closeDrawer(): void;
  addLine(input: {
    productSlug: string;
    variantId: string;
    quantity?: number;
    productName?: string;
  }): Promise<void>;
  updateQuantity(lineId: string, quantity: number): Promise<void>;
  removeLine(lineId: string): Promise<void>;
  clear(): Promise<void>;
}

const CartContext = createContext<CartContextValue | null>(null);

async function priceCart(lines: readonly PersistedLine[], id: string): Promise<Cart> {
  const response = await fetch('/api/cart/resolve', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, lines }),
  });
  if (!response.ok) throw new Error(`Cart pricing failed: ${response.status}`);
  const data = (await response.json()) as { cart: Cart };
  return data.cart;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const persisted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  /**
   * The priced cart, tagged with the `updatedAt` it was priced for. Tagging is
   * what lets "pricing is in flight" be derived rather than tracked as its own
   * state that can drift out of sync with the request.
   */
  const [priced, setPriced] = useState<{ cart: Cart; forUpdatedAt: string } | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Guards against a slow earlier response overwriting a newer one.
  const requestSeq = useRef(0);

  /**
   * Re-price whenever the persisted cart changes — including changes made in
   * another tab, which arrive through the store's `storage` listener. Every
   * state update happens in an async callback, never in the effect body.
   */
  useEffect(() => {
    if (persisted.lines.length === 0) return;

    const seq = (requestSeq.current += 1);
    let cancelled = false;

    void priceCart(persisted.lines, persisted.id)
      .then((next) => {
        if (!cancelled && seq === requestSeq.current) {
          setPriced({ cart: next, forUpdatedAt: persisted.updatedAt });
        }
      })
      .catch(() => {
        // Offline or a failed resolve. Keep whatever was last priced rather
        // than showing lines we cannot price; the identities survive for a retry.
      });

    return () => {
      cancelled = true;
    };
  }, [persisted]);

  const emptyCart = useMemo<Cart>(() => ({ ...EMPTY_CART, id: persisted.id }), [persisted.id]);

  /**
   * Hydration is derived from the store itself: the server snapshot carries the
   * sentinel id, so anything else means the real localStorage read has happened.
   */
  const isHydrated = persisted.id !== 'pending';

  const cart = persisted.lines.length === 0 ? emptyCart : (priced?.cart ?? emptyCart);

  const isPending = persisted.lines.length > 0 && priced?.forUpdatedAt !== persisted.updatedAt;

  const addLine = useCallback<CartContextValue['addLine']>(
    async ({ productSlug, variantId, quantity = 1, productName }) => {
      const existing = persisted.lines.find(
        (line) => line.productSlug === productSlug && line.variantId === variantId,
      );

      const lines: PersistedLine[] = existing
        ? persisted.lines.map((line) =>
            line === existing ? { ...line, quantity: line.quantity + quantity } : line,
          )
        : [...persisted.lines, { productSlug, variantId, quantity }];

      track({
        name: 'product_added_to_cart',
        product: { slug: productSlug, name: productName ?? productSlug, price: money(0) },
        variantId,
        quantity,
      });

      setPersistedCart({ ...persisted, lines, updatedAt: new Date().toISOString() });
      setIsDrawerOpen(true);
    },
    [persisted],
  );

  const updateQuantity = useCallback<CartContextValue['updateQuantity']>(
    async (id, quantity) => {
      const target = cart.lines.find((line) => line.id === id);
      if (!target) return;

      const matches = (line: PersistedLine) =>
        line.productSlug === target.productSlug && line.variantId === target.variantId;

      if (quantity <= 0) {
        track({
          name: 'product_removed_from_cart',
          productSlug: target.productSlug,
          variantId: target.variantId,
        });
        setPersistedCart({
          ...persisted,
          lines: persisted.lines.filter((line) => !matches(line)),
          updatedAt: new Date().toISOString(),
        });
        return;
      }

      setPersistedCart({
        ...persisted,
        lines: persisted.lines.map((line) => (matches(line) ? { ...line, quantity } : line)),
        updatedAt: new Date().toISOString(),
      });
    },
    [cart.lines, persisted],
  );

  const removeLine = useCallback<CartContextValue['removeLine']>(
    async (id) => {
      await updateQuantity(id, 0);
    },
    [updateQuantity],
  );

  const clear = useCallback<CartContextValue['clear']>(async () => {
    setPersistedCart({ ...persisted, lines: [], updatedAt: new Date().toISOString() });
  }, [persisted]);

  /**
   * Counted from the persisted cart, not the priced one, so the header badge is
   * correct the moment the page hydrates instead of waiting on a round trip.
   * Quantities are known locally; only money needs the server.
   */
  const lineCount = useMemo(
    () => persisted.lines.reduce((total, line) => total + line.quantity, 0),
    [persisted.lines],
  );

  const openDrawer = useCallback(() => setIsDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setIsDrawerOpen(false), []);

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      lineCount,
      isHydrated,
      isPending,
      isDrawerOpen,
      openDrawer,
      closeDrawer,
      addLine,
      updateQuantity,
      removeLine,
      clear,
    }),
    [
      addLine,
      cart,
      clear,
      closeDrawer,
      isDrawerOpen,
      isHydrated,
      isPending,
      lineCount,
      openDrawer,
      removeLine,
      updateQuantity,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used inside a CartProvider.');
  return context;
}
