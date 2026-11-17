import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AdminNav, type NavItem } from '@/components/admin/AdminNav';
import { getSession } from '@/server/admin/auth';
import { gatewayMode } from '@/server/admin/gateway';
import { ROLE_LABELS, can, type Permission } from '@/server/admin/permissions';
import { config } from '@/server/config';
import { getStore } from '@/server/store';

import { logoutAction } from '../actions/auth';

export const dynamic = 'force-dynamic';

const SECTIONS: ReadonlyArray<NavItem & { permission: Permission }> = [
  { href: '/admin', label: 'Overview', permission: 'overview.view' },
  { href: '/admin/products', label: 'Products', permission: 'products.view' },
  { href: '/admin/inventory', label: 'Inventory', permission: 'inventory.view' },
  { href: '/admin/orders', label: 'Orders', permission: 'orders.view' },
  { href: '/admin/customers', label: 'Customers', permission: 'customers.view' },
  { href: '/admin/promotions', label: 'Promotions', permission: 'offers.view' },
  { href: '/admin/content', label: 'Content', permission: 'content.edit' },
  { href: '/admin/drops', label: 'Drops', permission: 'drops.edit' },
  { href: '/admin/community', label: 'Community', permission: 'community.moderate' },
  { href: '/admin/marketing', label: 'Marketing', permission: 'marketing.view' },
  { href: '/admin/inbox', label: 'Inbox', permission: 'tickets.view' },
  { href: '/admin/analytics', label: 'Analytics', permission: 'analytics.view' },
  { href: '/admin/settings', label: 'Settings', permission: 'settings.view' },
];

const bannerBase = 'px-4 py-2 text-center text-xs font-black tracking-[0.12em] uppercase';

/** Says, on every screen, exactly which system a change will land in. */
function ModeBanner() {
  const mode = gatewayMode();
  if (mode === 'sandbox') {
    return (
      <div role="status" data-testid="mode-banner" data-mode="sandbox" className={`${bannerBase} bg-amber-400 text-neutral-950`}>
        Sandbox — changes are not sent to the real store
      </div>
    );
  }
  if (mode === 'shopify') {
    return (
      <div role="status" data-testid="mode-banner" data-mode="shopify" className={`${bannerBase} bg-red-700 text-white`}>
        Live — connected to {config.shopify.storeDomain}
      </div>
    );
  }
  return (
    <div role="status" data-testid="mode-banner" data-mode="disconnected" className={`${bannerBase} bg-neutral-300 text-neutral-950`}>
      Shopify Admin API not connected — commerce modules are disabled
    </div>
  );
}

export default async function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/admin/login');
  const items = SECTIONS.filter((section) => can(session.role, section.permission)).map(({ href, label }) => ({
    href,
    label,
  }));
  const store = getStore();
  const focus = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';

  return (
    <div className="flex min-h-full flex-col">
      <ModeBanner />
      {!store.durable && (
        <div role="alert" data-testid="storage-warning" className="bg-red-50 px-4 py-2 text-center text-xs font-bold text-red-900">
          Storage on this host is not durable: content, offers and moderation changes can be lost. Connect a KV store
          (see Settings).
        </div>
      )}
      <header className="bg-neutral-950 text-white">
        <div className="mx-auto flex max-w-[92rem] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/admin" className={`text-sm font-black tracking-[0.2em] uppercase ${focus}`}>
            INFNITY <span className="font-medium text-neutral-400">Back office</span>
          </Link>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span data-testid="session-identity" className="text-neutral-300">
              {session.email} · {ROLE_LABELS[session.role]}
            </span>
            <a href="/" target="_blank" rel="noopener noreferrer" className={`underline underline-offset-4 ${focus}`}>
              View storefront<span className="sr-only"> (opens in a new tab)</span>
            </a>
            <form action={logoutAction}>
              <button
                type="submit"
                data-testid="logout"
                className={`border border-white px-3 py-1.5 font-bold tracking-[0.1em] uppercase hover:bg-white hover:text-neutral-950 ${focus}`}
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <AdminNav items={items} />
      <div className="mx-auto w-full max-w-[92rem] flex-1 px-4 py-6 sm:px-6" id="admin-main">
        {children}
      </div>
    </div>
  );
}
