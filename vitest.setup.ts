import { afterEach, vi } from 'vitest';

/**
 * No `jest-dom`: the assertions in this suite read DOM properties directly,
 * which keeps the dependency list shorter and the failures easier to read.
 */
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  // Server integration suites run in the node environment, where there is no window.
  if (typeof window !== 'undefined') window.localStorage.clear();
});
