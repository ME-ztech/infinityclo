/**
 * Wishlist persistence.
 *
 * The saved list is a set of product slugs and nothing else — no prices, no
 * names, no imagery. Everything displayable is re-resolved from the catalogue,
 * for the same reason the cart does it: a stale localStorage entry must never be
 * able to show a customer a price that is no longer true.
 *
 * Exposed as a `useSyncExternalStore` source rather than React state because
 * localStorage genuinely is external — it can change in another tab, and the
 * heart on a card in one tab should fill in the other.
 *
 * The server snapshot is a frozen empty set, which is what makes hydration
 * exact: the first client render matches the server, then swaps to real data.
 */

const STORAGE_KEY = 'infnity.wishlist.v1';

export type WishlistSnapshot = readonly string[];

const EMPTY: WishlistSnapshot = Object.freeze([]);

const listeners = new Set<() => void>();

/**
 * Cached because `useSyncExternalStore` compares snapshots by identity: parsing
 * localStorage on every call would return a fresh array each time and spin the
 * component forever.
 */
let cache: WishlistSnapshot = EMPTY;
let isPrimed = false;

function parse(raw: string | null): WishlistSnapshot {
  if (!raw) return EMPTY;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    const slugs = parsed.filter((value): value is string => typeof value === 'string');
    return slugs.length > 0 ? Object.freeze([...new Set(slugs)]) : EMPTY;
  } catch {
    // A corrupt list should empty, not throw on render.
    return EMPTY;
  }
}

function read(): WishlistSnapshot {
  if (typeof window === 'undefined') return EMPTY;
  return parse(window.localStorage.getItem(STORAGE_KEY));
}

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  // Cross-tab sync. Registered once per subscriber and torn down with it.
  function onStorage(event: StorageEvent) {
    if (event.key !== null && event.key !== STORAGE_KEY) return;
    cache = read();
    listener();
  }

  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function getSnapshot(): WishlistSnapshot {
  if (!isPrimed) {
    cache = read();
    isPrimed = true;
  }
  return cache;
}

export function getServerSnapshot(): WishlistSnapshot {
  return EMPTY;
}

export function toggleWishlist(slug: string): boolean {
  const current = getSnapshot();
  const isSaved = current.includes(slug);
  const next = isSaved ? current.filter((entry) => entry !== slug) : [...current, slug];

  cache = Object.freeze(next);
  isPrimed = true;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private browsing or a full quota. The list still works for this session;
    // losing persistence is not worth breaking the page over.
  }

  emit();
  return !isSaved;
}

export const WISHLIST_STORAGE_KEY = STORAGE_KEY;

/** Test seam: resets the module cache between cases. */
export function __resetWishlistCache(): void {
  cache = EMPTY;
  isPrimed = false;
}
