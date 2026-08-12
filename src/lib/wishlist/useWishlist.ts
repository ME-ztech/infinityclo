'use client';

import { useCallback, useSyncExternalStore } from 'react';

import { track } from '@/lib/analytics';
import { getServerSnapshot, getSnapshot, subscribe, toggleWishlist } from './store';

export interface WishlistApi {
  readonly slugs: readonly string[];
  /** False until localStorage has been read, so the UI can avoid a flash. */
  readonly isHydrated: boolean;
  isSaved(slug: string): boolean;
  /** Returns the new saved state, so callers can announce it. */
  toggle(slug: string): boolean;
}

/**
 * Read/write access to the saved list.
 *
 * `isHydrated` exists so a card can render its control in a neutral state on the
 * server and fill it in after the real list is known. Rendering the filled state
 * optimistically would produce a hydration mismatch on every saved product.
 */
export function useWishlist(): WishlistApi {
  const slugs = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const isHydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  const toggle = useCallback((slug: string) => {
    const isSaved = toggleWishlist(slug);
    track({ name: isSaved ? 'wishlist_added' : 'wishlist_removed', productSlug: slug });
    return isSaved;
  }, []);

  const isSaved = useCallback((slug: string) => slugs.includes(slug), [slugs]);

  return { slugs, isHydrated, isSaved, toggle };
}
