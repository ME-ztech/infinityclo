import Link from 'next/link';
import type { ReactNode } from 'react';

import { logoutAction } from '@/app/account/actions';

/**
 * Account surfaces: the signed-in shell with its navigation, and the narrow
 * card used by the sign-in, registration and password pages.
 */
const ACCOUNT_NAV = [
  { label: 'Overview', href: '/account' },
  { label: 'Orders', href: '/account/orders' },
  { label: 'Addresses', href: '/account/addresses' },
  { label: 'Profile', href: '/account/profile' },
  { label: 'Help & returns', href: '/account/help' },
  { label: 'Wishlist', href: '/account/wishlist' },
];

const GUEST_NAV = [
  { label: 'Sign in', href: '/account/login' },
  { label: 'Create account', href: '/account/register' },
  { label: 'Wishlist', href: '/account/wishlist' },
];

export const FIELD =
  'border-field bg-surface text-fg placeholder:text-fg-faint h-12 w-full rounded-(--radius-control) border px-3 text-sm ' +
  'focus:border-fg focus:outline-none';
export const LABEL = 'text-fg-muted mb-2 block text-[0.68rem] font-semibold tracking-[0.16em] uppercase';
export const SUBMIT =
  'bg-inverse-surface text-inverse-fg inline-flex h-12 cursor-pointer items-center justify-center rounded-(--radius-control) px-6 ' +
  'text-[0.72rem] font-semibold tracking-[0.18em] uppercase transition-opacity hover:opacity-85';
export const SECONDARY_SUBMIT =
  'border-fg/25 text-fg hover:border-fg inline-flex h-12 cursor-pointer items-center justify-center rounded-(--radius-control) border px-6 ' +
  'text-[0.72rem] font-semibold tracking-[0.18em] uppercase transition-colors';

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** First value of a query parameter, length-capped, for `?notice=` / `?error=`. */
export function param(params: Record<string, string | string[] | undefined>, name: string): string | null {
  const value = params[name];
  const first = Array.isArray(value) ? value[0] : value;
  return first ? first.slice(0, 300) : null;
}

export function Messages({ notice, error }: { notice?: string | null; error?: string | null }) {
  return (
    <>
      {notice && (
        <p role="status" data-testid="account-notice" className="border-fg text-fg mb-6 border-l-2 py-1 pl-4 text-left text-sm">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" data-testid="account-error" className="border-signal text-signal mb-6 border-l-2 py-1 pl-4 text-left text-sm">
          {error}
        </p>
      )}
    </>
  );
}

interface ShellProps {
  title: string;
  /** Path of the current page, used to mark the active nav item. */
  current: string;
  signedIn: boolean;
  notice?: string | null;
  error?: string | null;
  children: ReactNode;
}

export function AccountShell({ title, current, signedIn, notice, error, children }: ShellProps) {
  const nav = signedIn ? ACCOUNT_NAV : GUEST_NAV;
  return (
    <div className="edge pt-14 pb-(--spacing-section) md:pt-20">
      <h1 className="font-display text-headline text-fg mb-10 text-center lg:text-left">{title}</h1>

      <div className="grid gap-10 lg:grid-cols-[200px_1fr] lg:gap-16">
        <nav aria-label="Account">
          <ul className="flex flex-wrap justify-center gap-x-6 gap-y-3 lg:flex-col lg:justify-start">
            {nav.map((item) => {
              const active = item.href === current;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`text-[0.72rem] font-semibold tracking-[0.16em] uppercase ${
                      active ? 'text-fg underline underline-offset-8' : 'text-fg-muted hover:text-fg'
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
            {signedIn && (
              <li>
                <form action={logoutAction}>
                  <button
                    type="submit"
                    data-testid="account-sign-out"
                    className="text-fg-muted hover:text-fg cursor-pointer text-[0.72rem] font-semibold tracking-[0.16em] uppercase"
                  >
                    Sign out
                  </button>
                </form>
              </li>
            )}
          </ul>
        </nav>

        <div className="min-w-0">
          <Messages notice={notice} error={error} />
          {children}
        </div>
      </div>
    </div>
  );
}

/** Centred card for sign-in, registration and password pages. */
export function AuthCard({
  title,
  intro,
  notice,
  error,
  children,
  footer,
}: {
  title: string;
  intro?: string;
  notice?: string | null;
  error?: string | null;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="edge pt-14 pb-(--spacing-section) md:pt-20">
      <div className="mx-auto max-w-md text-center">
        <h1 className="font-display text-headline text-fg">{title}</h1>
        {intro && <p className="text-fg-muted mt-4 text-sm leading-relaxed">{intro}</p>}
        <div className="mt-10 text-left">
          <Messages notice={notice} error={error} />
          {children}
        </div>
        {footer && <div className="text-fg-muted mt-8 space-y-2 text-sm">{footer}</div>}
      </div>
    </div>
  );
}

export function Unavailable({ message }: { message: string }) {
  return (
    <div className="border-line border p-8 md:p-12" role="alert">
      <p className="font-display text-fg text-2xl">Temporarily unavailable</p>
      <p className="text-fg-muted mt-4 max-w-md text-sm leading-relaxed">{message}</p>
    </div>
  );
}
