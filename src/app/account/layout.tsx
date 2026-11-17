import type { Metadata } from 'next';

/**
 * Everything under /account is per-customer and must never be cached or
 * indexed. Each page reads the session cookie, which makes it dynamic; this
 * makes that explicit so no account page can be statically prerendered by
 * accident, and keeps the whole section out of search engines.
 */
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return children;
}
