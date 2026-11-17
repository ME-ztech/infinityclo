import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { default: 'Back office', template: '%s — INFNITY back office' },
  robots: { index: false, follow: false, nocache: true },
};

const HIDE_STOREFRONT_CHROME =
  'body:has([data-admin-root]) > :not(main):not(script):not(style):not(next-route-announcer){display:none!important}' +
  'body:has([data-admin-root]){overflow:hidden}';

/**
 * Admin root.
 *
 * The back office is a self-contained shell. The storefront header, footer and
 * cart drawer belong to the root layout; here they are taken out of the page
 * (and out of the tab order) so an operator never lands in shop chrome, and the
 * shell covers the viewport as a second line of defence.
 */
export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{HIDE_STOREFRONT_CHROME}</style>
      <div data-admin-root className="fixed inset-0 z-[200] overflow-auto bg-neutral-100 font-sans text-neutral-950 antialiased">
        {children}
      </div>
    </>
  );
}
