import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AuthCard, FIELD, LABEL, SUBMIT, param, type SearchParams } from '@/components/account/AccountShell';
import { currentCustomer, safeReturnTo } from '@/server/commerce/session';

import { loginAction } from '../actions';

export const metadata: Metadata = { title: 'Sign in', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const returnTo = safeReturnTo(param(params, 'returnTo'));
  if (await currentCustomer()) redirect(returnTo);

  return (
    <AuthCard
      title="Sign in"
      intro="See your orders and tracking, and manage your addresses."
      notice={param(params, 'notice')}
      error={param(params, 'error')}
      footer={
        <>
          <p>
            New here?{' '}
            <Link href="/account/register" className="text-fg underline underline-offset-4">
              Create an account
            </Link>
          </p>
          <p>
            <Link href="/account/forgot" className="text-fg underline underline-offset-4">
              Forgot your password?
            </Link>
          </p>
          <p>You don’t need an account to shop — checkout works as a guest.</p>
        </>
      }
    >
      <form action={loginAction} className="space-y-5" data-testid="login-form">
        <input type="hidden" name="returnTo" value={returnTo} />
        <div>
          <label htmlFor="login-email" className={LABEL}>
            Email
          </label>
          <input id="login-email" name="email" type="email" autoComplete="email" required className={FIELD} />
        </div>
        <div>
          <label htmlFor="login-password" className={LABEL}>
            Password
          </label>
          <input id="login-password" name="password" type="password" autoComplete="current-password" required className={FIELD} />
        </div>
        <button type="submit" className={`${SUBMIT} w-full`}>
          Sign in
        </button>
      </form>
    </AuthCard>
  );
}
