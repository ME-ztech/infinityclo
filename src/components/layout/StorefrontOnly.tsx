'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * Renders its children on storefront routes only.
 *
 * The back office has its own header and navigation. Without this, the store's
 * header, footer and cart drawer would still be in the page underneath it —
 * invisible, but reachable by keyboard and announced by screen readers.
 */
export function StorefrontOnly({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return null;
  return <>{children}</>;
}
