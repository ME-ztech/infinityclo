import { afterEach, vi } from 'vitest';

/**
 * No `jest-dom`: the assertions in this suite read DOM properties directly,
 * which keeps the dependency list shorter and the failures easier to read.
 */
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});
