import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AuthCard, FIELD, LABEL, SUBMIT, param, type SearchParams } from '@/components/account/AccountShell';
import { currentCustomer } from '@/server/commerce/session';
import { NEWSLETTER_CONSENT_TEXT } from '@/server/records';

import { registerAction } from '../actions';

export const metadata: Metadata = { title: 'Create account', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function RegisterPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  if (await currentCustomer()) redirect('/account');

  return (
    <AuthCard
      title="Create account"
      intro="Track orders and check out faster. We’ll email you a link to confirm your address."
      error={param(params, 'error')}
      footer={
        <p>
          Already have an account?{' '}
          <Link href="/account/login" className="text-fg underline underline-offset-4">
            Sign in
          </Link>
        </p>
      }
    >
      <form action={registerAction} className="space-y-5" data-testid="register-form">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="reg-first" className={LABEL}>
              First name
            </label>
            <input id="reg-first" name="firstName" autoComplete="given-name" className={FIELD} />
          </div>
          <div>
            <label htmlFor="reg-last" className={LABEL}>
              Last name
            </label>
            <input id="reg-last" name="lastName" autoComplete="family-name" className={FIELD} />
          </div>
        </div>
        <div>
          <label htmlFor="reg-email" className={LABEL}>
            Email
          </label>
          <input id="reg-email" name="email" type="email" autoComplete="email" required className={FIELD} />
        </div>
        <div>
          <label htmlFor="reg-password" className={LABEL}>
            Password
          </label>
          <input
            id="reg-password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            aria-describedby="reg-password-hint"
            className={FIELD}
          />
          <p id="reg-password-hint" className="text-fg-muted mt-2 text-xs">
            At least 12 characters.
          </p>
        </div>
        {/* Unticked by default: an account is not permission to send marketing. */}
        <label className="text-fg-muted flex items-start gap-3 text-sm leading-snug">
          <input type="checkbox" name="marketingConsent" className="mt-1 h-4 w-4" />
          <span>{NEWSLETTER_CONSENT_TEXT} Optional.</span>
        </label>
        <button type="submit" className={`${SUBMIT} w-full`}>
          Create account
        </button>
        <p className="text-fg-muted text-xs leading-relaxed">
          By creating an account you agree to our{' '}
          <Link href="/terms" className="underline underline-offset-2">
            terms
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="underline underline-offset-2">
            privacy policy
          </Link>
          .
        </p>
      </form>
    </AuthCard>
  );
}
