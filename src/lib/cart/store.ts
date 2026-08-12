/**
 * The persisted cart as an external store.
 *
 * localStorage genuinely is an external system, so it is modelled as one and
 * consumed with `useSyncExternalStore` rather than being copied into state
 * inside an effect. Three things fall out of that:
 *
 * - The server snapshot is a stable empty cart, so hydration matches exactly.
 * - `storage` events are forwarded, so two open tabs stay in sync instead of
 *   silently overwriting each other's cart.
 * - `getSnapshot` returns a cached object; React re-renders on identity change,
 *   so re-parsing on every call would loop forever.
 */
import {
  createEmptyPersistedCart,
  readPersistedCart,
  writePersistedCart,
  CART_STORAGE_KEY,
  type PersistedCart,
} from './storage';

/** Stable identity for the server and for the first client render. */
const SERVER_SNAPSHOT: PersistedCart = { id: 'pending', lines: [], updatedAt: '' };

let snapshot: PersistedCart | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  // Another tab wrote the cart. Drop the cache so the next snapshot re-reads.
  function onStorage(event: StorageEvent) {
    if (event.key !== null && event.key !== CART_STORAGE_KEY) return;
    snapshot = null;
    emit();
  }

  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function getSnapshot(): PersistedCart {
  snapshot ??= readPersistedCart() ?? createEmptyPersistedCart();
  return snapshot;
}

export function getServerSnapshot(): PersistedCart {
  return SERVER_SNAPSHOT;
}

/** Writes through to storage and notifies every subscriber in this tab. */
export function setPersistedCart(next: PersistedCart): void {
  snapshot = next;
  writePersistedCart(next);
  emit();
}
