import Link from 'next/link';
import { redirect } from 'next/navigation';

import { BrandLogo } from '@/components/ui/Wordmark';
import { can, ROLE_LABELS, type Permission } from '@/domain/rbac';
import { getStaffSession } from '@/server/auth/staff';
import { databaseKind } from '@/server/db/client';
import { isAdminConfigured } from '@/server/shopify/config';

import { logoutAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: { default: 'Back office', template: '%s — INFNITY back office' },
  robots: { index: false, follow: false },
};

const NAV: Array<{ href: string; label: string; permission: Permission }> = [
  { href: '/admin', label: 'Overview', permission: 'overview:read' },
  { href: '/admin/products', label: 'Products', permission: 'products:read' },
  { href: '/admin/inventory', label: 'Inventory', permission: 'inventory:read' },
  { href: '/admin/orders', label: 'Orders', permission: 'orders:read' },
  { href: '/admin/customers', label: 'Customers', permission: 'customers:read' },
  { href: '/admin/promotions', label: 'Promotions', permission: 'promotions:read' },
  { href: '/admin/content', label: 'Content', permission: 'content:read' },
  { href: '/admin/drops', label: 'Drops & waitlists', permission: 'drops:write' },
  { href: '/admin/community', label: 'Community', permission: 'community:moderate' },
  { href: '/admin/marketing', label: 'Marketing', permission: 'marketing:read' },
  { href: '/admin/messages', label: 'Inbox', permission: 'messages:read' },
  { href: '/admin/analytics', label: 'Analytics', permission: 'analytics:read' },
  { href: '/admin/settings', label: 'Settings & staff', permission: 'settings:read' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getStaffSession();
  if (!session) redirect('/admin/login');
  const role = session.user.role;
  const db = databaseKind();
  return (
    <div className="min-h-dvh bg-neutral-100 text-neutral-900">
      <header className="border-line sticky top-0 z-40 flex h-14 items-center justify-between gap-4 border-b bg-white px-4">
        <Link href="/admin" className="flex items-center gap-3">
          <BrandLogo compact />
          <span className="hidden text-xs font-semibold tracking-wide text-neutral-500 uppercase sm:inline">
            Back office
          </span>
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <Link
            href="/"
            className="hidden underline-offset-4 hover:underline sm:inline"
            target="_blank"
          >
            View store
          </Link>
          <span className="hidden text-neutral-600 md:inline" data-testid="admin-user">
            {session.user.email} · {ROLE_LABELS[role]}
          </span>
          <form action={logoutAction}>
            <button type="submit" className="font-semibold underline-offset-4 hover:underline">
              Sign out
            </button>
          </form>
        </div>
      </header>
      {db !== 'postgres' && (
        <p
          className="bg-amber-100 px-4 py-2 text-center text-xs text-amber-950"
          role="status"
          data-testid="ephemeral-db"
        >
          Preview storage: this deployment uses an in-process database ({db}). Content and records
          here are not durable — set DATABASE_URL before going live.
        </p>
      )}
      {!isAdminConfigured() && (
        <p className="bg-neutral-200 px-4 py-2 text-center text-xs text-neutral-800" role="status">
          Shopify Admin API not connected: products, inventory, orders, customers, live discounts
          and sales are read-only or unavailable. Content, promotions drafts, drops, community,
          inbox and staff work fully.
        </p>
      )}
      <div className="flex">
        <nav
          aria-label="Back office"
          className="border-line hidden w-56 shrink-0 border-r bg-white md:block"
        >
          <ul className="sticky top-14 flex flex-col py-3">
            {NAV.filter((item) => can(role, item.permission)).map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="block px-5 py-2 text-sm hover:bg-neutral-100">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 flex-1">
          <nav
            aria-label="Back office (mobile)"
            className="border-line overflow-x-auto border-b bg-white md:hidden"
          >
            <ul className="flex gap-1 px-2 py-2">
              {NAV.filter((item) => can(role, item.permission)).map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="block px-3 py-2 text-sm whitespace-nowrap hover:bg-neutral-100"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <main id="main" className="p-4 md:p-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
