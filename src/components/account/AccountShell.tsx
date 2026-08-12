import Link from 'next/link';

import { ButtonLink } from '@/components/ui/Button';

/**
 * Account surfaces.
 *
 * Authentication is not implemented, so these pages present the real navigation
 * a customer account will have and state plainly that it is not yet available.
 *
 * What they deliberately avoid is a fake sign-in form. A working-looking login
 * that silently discards a password would train customers to hand credentials
 * to a form that does nothing with them — worse than an empty page, not better.
 */
const ACCOUNT_NAV = [
  { label: 'Overview', href: '/account' },
  { label: 'Orders', href: '/account/orders' },
  { label: 'Wishlist', href: '/account/wishlist' },
];

export function AccountShell({ title, description }: { title: string; description: string }) {
  return (
    <div className="edge pt-14 pb-(--spacing-section) md:pt-20">
      <h1 className="font-display text-headline text-fg mb-10">{title}</h1>

      <div className="grid gap-10 lg:grid-cols-[200px_1fr] lg:gap-16">
        <nav aria-label="Account">
          <ul className="flex flex-wrap gap-x-6 gap-y-3 lg:flex-col">
            {ACCOUNT_NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="text-fg-muted hover:text-fg text-[0.72rem] font-semibold tracking-[0.16em] uppercase"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-line border p-8 md:p-12">
          <p className="font-display text-fg text-2xl">Accounts are not open yet</p>
          <p className="text-fg-muted mt-4 max-w-md text-sm leading-relaxed">{description}</p>
          <p className="text-fg-muted mt-4 max-w-md text-sm leading-relaxed">
            There is no sign-in yet — nothing here will ask you for a password until accounts
            genuinely work.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/shop" variant="primary" size="md">
              Shop all
            </ButtonLink>
            <ButtonLink href="/contact" variant="secondary" size="md">
              Contact
            </ButtonLink>
          </div>
        </div>
      </div>
    </div>
  );
}
