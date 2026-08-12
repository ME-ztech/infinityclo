'use client';

/**
 * Cart state.
 *
 * Hydration safety is the main constraint here. The persisted cart lives in
 * localStorage, which the server cannot see, so the first client render must
 * match the server's empty cart exactly. `isHydrated` gates every count and
 * total until the stored cart has been read and priced — that is why the header
 * badge renders nothing rather than 0 on first paint.
 *
 * Mutations update local state immediately and re-price against the server, so
 * the UI stays responsive while prices stay authoritative.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { money } from '@/domain/money';
import type { Cart } from '@/domain/types';
import { track } from '@/lib/analytics';
import {
  createEmptyPersistedCart,
  readPersistedCart,
  writePersistedCart,
  type PersistedCart,
  type PersistedLine,
} from './storage';

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

async function priceCart(persisted: PersistedCart): Promise<Cart> {
  const response = await fetch('/api/cart/resolve', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(persisted),
  });
  if (!response.ok) throw new Error(`Cart pricing failed: ${response.status}`);
  const data = (await response.json()) as { cart: Cart };
  return data.cart;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [persisted, setPersisted] = useState<PersistedCart | null>(null);
  const [cart, setCart] = useState<Cart>(EMPTY_CART);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Guards against an older in-flight pricing response overwriting a newer one.
  const requestSeq = useRef(0);

  useEffect(() => {
    const stored = readPersistedCart() ?? createEmptyPersistedCart();
    setPersisted(stored);

    if (stored.lines.length === 0) {
      setCart({ ...EMPTY_CART, id: stored.id });
      setIsHydrated(true);
      return;
    }

    let cancelled = false;
    void priceCart(stored)
      .then((priced) => {
        if (!cancelled) setCart(priced);
      })
      .catch(() => {
        // Offline or a failed resolve: keep the cart empty rather than showing
        // lines we cannot price. The stored identities survive for a retry.
        if (!cancelled) setCart({ ...EMPTY_CART, id: stored.id });
      })
      .finally(() => {
        if (!cancelled) setIsHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const commit = useCallback(async (next: PersistedCart) => {
    const seq = (requestSeq.current += 1);
    setPersisted(next);
    writePersistedCart(next);
    setIsPending(true);

    try {
      const priced = await priceCart(next);
      if (seq === requestSeq.current) setCart(priced);
    } catch {
      if (seq === requestSeq.current) {
        // Leave the previous priced cart in place; the mutation is persisted and
        // will resolve on the next successful call.
      }
    } finally {
      if (seq === requestSeq.current) setIsPending(false);
    }
  }, []);

  const addLine = useCallback<CartContextValue['addLine']>(
    async ({ productSlug, variantId, quantity = 1, productName }) => {
      const base = persisted ?? createEmptyPersistedCart();
      const existing = base.lines.find(
        (line) => line.productSlug === productSlug && line.variantId === variantId,
      );

      const lines: PersistedLine[] = existing
        ? base.lines.map((line) =>
            line === existing ? { ...line, quantity: line.quantity + quantity } : line,
          )
        : [...base.lines, { productSlug, variantId, quantity }];

      track({
        name: 'product_added_to_cart',
        product: { slug: productSlug, name: productName ?? productSlug, price: money(0) },
        variantId,
        quantity,
      });

      await commit({ ...base, lines, updatedAt: new Date().toISOString() });
      setIsDrawerOpen(true);
    },
    [commit, persisted],
  );

  const updateQuantity = useCallback<CartContextValue['updateQuantity']>(
    async (id, quantity) => {
      if (!persisted) return;
      const target = cart.lines.find((line) => line.id === id);
      if (!target) return;

      if (quantity <= 0) {
        const lines = persisted.lines.filter(
          (line) =>
            !(line.productSlug === target.productSlug && line.variantId === target.variantId),
        );
        track({
          name: 'product_removed_from_cart',
          productSlug: target.productSlug,
          variantId: target.variantId,
        });
        await commit({ ...persisted, lines, updatedAt: new Date().toISOString() });
        return;
      }

      const lines = persisted.lines.map((line) =>
        line.productSlug === target.productSlug && line.variantId === target.variantId
          ? { ...line, quantity }
          : line,
      );
      await commit({ ...persisted, lines, updatedAt: new Date().toISOString() });
    },
    [cart.lines, commit, persisted],
  );

  const removeLine = useCallback<CartContextValue['removeLine']>(
    async (id) => {
      await updateQuantity(id, 0);
    },
    [updateQuantity],
  );

  const clear = useCallback<CartContextValue['clear']>(async () => {
    const base = persisted ?? createEmptyPersistedCart();
    await commit({ ...base, lines: [], updatedAt: new Date().toISOString() });
  }, [commit, persisted]);

  const lineCount = useMemo(
    () => cart.lines.reduce((total, line) => total + line.quantity, 0),
    [cart.lines],
  );

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      lineCount,
      isHydrated,
      isPending,
      isDrawerOpen,
      openDrawer: () => setIsDrawerOpen(true),
      closeDrawer: () => setIsDrawerOpen(false),
      addLine,
      updateQuantity,
      removeLine,
      clear,
    }),
    [addLine, cart, clear, isDrawerOpen, isHydrated, isPending, lineCount, removeLine, updateQuantity],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used inside a CartProvider.');
  return context;
}
