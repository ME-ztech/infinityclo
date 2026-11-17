import Link from 'next/link';
import type { ReactNode } from 'react';

import { ButtonLink } from '@/components/ui/Button';

/**
 * Account surfaces.
 *
 * Sign-in is Shopify's hosted, passwordless login — there is no password form
 * anywhere on this site, by design. These components render the three honest
 * states an account page can be in: signed in, signed out, and "this store's
 * account pages are hosted by Shopify" when no OAuth client is configured.
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
  { label: 'Account', href: '/account' },
  { label: 'Wishlist', href: '/account/wishlist' },
];

export const FIELD =
  'border-line bg-field text-fg placeholder:text-fg-faint h-12 w-full rounded-(--radius-control) border px-3 text-sm ' +
  'focus:border-fg focus:outline-none';
export const LABEL = 'text-fg-muted mb-2 block text-[0.68rem] font-semibold tracking-[0.16em] uppercase';
export const SUBMIT =
  'bg-inverse-surface text-inverse-fg inline-flex h-12 items-center justify-center rounded-(--radius-control) px-6 ' +
  'text-[0.72rem] font-semibold tracking-[0.18em] uppercase transition-opacity hover:opacity-85';
export const SECONDARY_SUBMIT =
  'border-fg/25 text-fg hover:border-fg inline-flex h-12 items-center justify-center rounded-(--radius-control) border px-6 ' +
  'text-[0.72rem] font-semibold tracking-[0.18em] uppercase transition-colors';

interface ShellProps {
  title: string;
  /** Path of the current page, used to mark the active nav item. */
  current: string;
  signedIn: boolean;
  /** Success message carried back from a form post. */
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
                <form action="/api/auth/customer/logout" method="post">
                  <button
                    type="submit"
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
          {notice && (
            <p role="status" className="border-fg text-fg mb-6 border-l-2 py-1 pl-4 text-sm">
              {notice}
            </p>
          )}
          {error && (
            <p role="alert" className="border-signal text-signal mb-6 border-l-2 py-1 pl-4 text-sm">
              {error}
            </p>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

/** Messages for the `?error=` codes the sign-in routes redirect with. */
const AUTH_ERRORS: Record<string, string> = {
  state: 'That sign-in attempt could not be verified. Please try again.',
  code: 'That sign-in attempt could not be completed. Please try again.',
  token: 'That sign-in attempt could not be completed. Please try again.',
  signin: 'Sign-in did not complete. Please try again.',
  cancelled: 'Sign-in was cancelled.',
  expired: 'Your session ended. Sign in again to continue.',
  rate_limited: 'Too many sign-in attempts. Try again in a minute.',
  unavailable: 'Sign-in is unavailable right now.',
};

export function authErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  // Form handlers send a full sentence; sign-in routes send a short code.
  return AUTH_ERRORS[code] ?? (/\s/.test(code) ? code.slice(0, 300) : null);
}

interface SignedOutProps {
  /** True when this storefront runs its own Shopify OAuth sign-in. */
  configured: boolean;
  /** Shopify-hosted account page, used when it does not. */
  hostedAccountUrl: string;
  returnTo?: string;
}

/**
 * The signed-out panel. One button, and it always leads to Shopify's own login:
 * either through this site's OAuth flow, or straight to the store's hosted
 * account page. No email or password field is rendered here.
 */
export function SignedOutPanel({ configured, hostedAccountUrl, returnTo = '/account' }: SignedOutProps) {
  return (
    <div className="border-line border p-8 text-center md:p-12" data-testid="account-signed-out">
      <p className="font-display text-fg text-2xl">Sign in to your account</p>
      <p className="text-fg-muted mx-auto mt-4 max-w-md text-sm leading-relaxed">
        See your orders and tracking, manage addresses and ask for help with an order. Sign-in is
        handled securely by Shopify with a one-time code sent to your email — there is no password
        to remember.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {/* A plain anchor: this is a full navigation to Shopify, not a client route. */}
        <a
          href={
            configured
              ? `/api/auth/customer/login?returnTo=${encodeURIComponent(returnTo)}`
              : hostedAccountUrl
          }
          rel="noopener"
          data-testid="account-sign-in"
          className="bg-inverse-surface text-inverse-fg inline-flex h-12 items-center justify-center rounded-(--radius-control) px-6 text-[0.72rem] font-semibold tracking-[0.18em] uppercase transition-opacity hover:opacity-85"
        >
          Sign in with Shopify
        </a>
        <ButtonLink href="/shop" variant="secondary" size="md">
          Continue shopping
        </ButtonLink>
      </div>

      {!configured && (
        <p className="text-fg-muted mx-auto mt-6 max-w-md text-xs leading-relaxed">
          This opens our store’s secure account page, hosted by Shopify, where your orders and
          tracking live.
        </p>
      )}
      <p className="text-fg-muted mx-auto mt-6 max-w-md text-xs leading-relaxed">
        You don’t need an account to shop — checkout works as a guest.
      </p>
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
