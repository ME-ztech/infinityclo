import Link from 'next/link';

import { ButtonLink } from '@/components/ui/Button';

const ACCOUNT_NAV = [
  { label: 'Overview', href: '/account' },
  { label: 'Orders', href: '/account/orders' },
  { label: 'Wishlist', href: '/account/wishlist' },
];

export function AccountLayout({ title, signedIn, children }: { title: string; signedIn: boolean; children: React.ReactNode }) {
  return (
    <div className="edge pt-14 pb-(--spacing-section) md:pt-20">
      <h1 className="font-display mb-10 text-center text-[clamp(2.2rem,7vw,3.8rem)] leading-[0.9] lg:text-left">{title}</h1>
      <div className="grid gap-10 lg:grid-cols-[200px_1fr] lg:gap-16">
        <nav aria-label="Account" className="flex flex-wrap items-start justify-center gap-x-6 gap-y-3 lg:flex-col lg:justify-start">
          {ACCOUNT_NAV.map((item) => (
            <Link key={item.href} href={item.href} className="text-fg-muted hover:text-fg flex min-h-11 items-center text-[0.72rem] font-semibold tracking-[0.16em] uppercase">
              {item.label}
            </Link>
          ))}
          {signedIn && (
            <form action="/account/sign-out" method="post">
              <button type="submit" className="text-fg-muted hover:text-signal flex min-h-11 items-center text-[0.72rem] font-semibold tracking-[0.16em] uppercase" data-testid="sign-out">
                Sign out
              </button>
            </form>
          )}
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}

/** Shown when the Customer Account API is not connected: customers use Shopify's hosted account pages. */
export function HostedAccountNotice({ accountUrl }: { accountUrl: string }) {
  return (
    <div className="border-line border p-8 text-center md:p-12 md:text-left" data-testid="hosted-account">
      <p className="font-display text-2xl">Sign in to see your orders</p>
      <p className="text-fg-muted mt-4 max-w-md text-sm leading-relaxed">
        Your INFNITY account — order history, tracking and saved addresses — is hosted securely by Shopify, where your past orders already live.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3 md:justify-start">
        <ButtonLink href={accountUrl} variant="primary" size="md">
          Sign in / sign up
        </ButtonLink>
        <ButtonLink href="/account/wishlist" variant="secondary" size="md">
          Your wishlist
        </ButtonLink>
      </div>
      <p className="text-fg-faint mt-6 text-xs">No account needed to shop — guest checkout is always available.</p>
    </div>
  );
}

export function SignInPrompt({ returnTo, error }: { returnTo: string; error?: string }) {
  const messages: Record<string, string> = {
    signin_cancelled: 'Sign-in was cancelled.',
    signin_state: 'That sign-in link expired. Please try again.',
    signin_failed: 'We couldn’t complete sign-in. Please try again.',
    signin_unavailable: 'Sign-in is temporarily unavailable.',
  };
  return (
    <div className="border-line border p-8 text-center md:p-12 md:text-left" data-testid="sign-in-prompt">
      {error && messages[error] && (
        <p role="alert" className="text-signal mb-4 text-sm">
          {messages[error]}
        </p>
      )}
      <p className="font-display text-2xl">Sign in or create an account</p>
      <p className="text-fg-muted mt-4 max-w-md text-sm leading-relaxed">
        We’ll email you a one-time code — no password to remember. Your orders, tracking and addresses are all here once you’re in.
      </p>
      <div className="mt-8 flex justify-center md:justify-start">
        <ButtonLink href={`/account/sign-in?returnTo=${encodeURIComponent(returnTo)}`} variant="primary" size="md">
          Continue with email
        </ButtonLink>
      </div>
      <p className="text-fg-faint mt-6 text-xs">Creating an account does not sign you up for marketing emails.</p>
    </div>
  );
}
