import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  __resetWishlistCache,
  getServerSnapshot,
  getSnapshot,
  subscribe,
  toggleWishlist,
  WISHLIST_STORAGE_KEY,
} from './store';

beforeEach(() => {
  window.localStorage.clear();
  __resetWishlistCache();
});

describe('wishlist store', () => {
  it('starts empty and adds and removes a slug', () => {
    expect(getSnapshot()).toEqual([]);

    expect(toggleWishlist('infnitys-iced-raven-tank')).toBe(true);
    expect(getSnapshot()).toEqual(['infnitys-iced-raven-tank']);

    expect(toggleWishlist('infnitys-iced-raven-tank')).toBe(false);
    expect(getSnapshot()).toEqual([]);
  });

  it('persists across a fresh read of localStorage', () => {
    toggleWishlist('infnitys-varsity-hoodie');
    __resetWishlistCache();
    expect(getSnapshot()).toEqual(['infnitys-varsity-hoodie']);
  });

  /**
   * `useSyncExternalStore` compares snapshots by identity. Returning a freshly
   * parsed array on every call would spin the component forever, so this is the
   * load-bearing invariant of the whole module, not a micro-optimisation.
   */
  it('returns a stable snapshot identity between changes', () => {
    toggleWishlist('a');
    const first = getSnapshot();
    expect(getSnapshot()).toBe(first);

    toggleWishlist('b');
    expect(getSnapshot()).not.toBe(first);
  });

  it('notifies subscribers on change and stops after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);

    toggleWishlist('a');
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    toggleWishlist('b');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('serves an empty server snapshot so hydration matches', () => {
    toggleWishlist('a');
    expect(getServerSnapshot()).toEqual([]);
  });

  it('discards a corrupt stored value rather than throwing during render', () => {
    window.localStorage.setItem(WISHLIST_STORAGE_KEY, '{ not json');
    __resetWishlistCache();
    expect(getSnapshot()).toEqual([]);
  });

  it('drops non-string entries and duplicates from a tampered value', () => {
    window.localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(['a', 7, 'a', null, 'b']));
    __resetWishlistCache();
    expect(getSnapshot()).toEqual(['a', 'b']);
  });

  it('survives a storage write failure without losing the in-memory list', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    expect(() => toggleWishlist('a')).not.toThrow();
    // Persistence is lost, but the session's list must still be correct.
    expect(getSnapshot()).toEqual(['a']);

    setItem.mockRestore();
  });
});
