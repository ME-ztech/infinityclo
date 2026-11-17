import type { Metadata } from 'next';
import Link from 'next/link';

import { AuthCard, FIELD, LABEL, SUBMIT, param, type SearchParams } from '@/components/account/AccountShell';

import { forgotPasswordAction, resendVerificationAction } from '../actions';

export const metadata: Metadata = { title: 'Reset password', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function ForgotPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  return (
    <AuthCard
      title="Reset password"
      intro="Enter your email and we’ll send a link to choose a new password."
      notice={param(params, 'notice')}
      error={param(params, 'error')}
      footer={
        <p>
          <Link href="/account/login" className="text-fg underline underline-offset-4">
            Back to sign in
          </Link>
        </p>
      }
    >
      <form action={forgotPasswordAction} className="space-y-5" data-testid="forgot-form">
        <div>
          <label htmlFor="forgot-email" className={LABEL}>
            Email
          </label>
          <input id="forgot-email" name="email" type="email" autoComplete="email" required className={FIELD} />
        </div>
        <button type="submit" className={`${SUBMIT} w-full`}>
          Send reset link
        </button>
      </form>

      <form action={resendVerificationAction} className="border-line mt-10 space-y-4 border-t pt-8">
        <p className="text-fg-muted text-sm">Didn’t get the email to confirm a new account? Send it again.</p>
        <label htmlFor="resend-email" className="sr-only">
          Email
        </label>
        <input id="resend-email" name="email" type="email" autoComplete="email" required placeholder="Email" className={FIELD} />
        <button type="submit" className="text-fg cursor-pointer text-sm underline underline-offset-4">
          Resend confirmation email
        </button>
      </form>
    </AuthCard>
  );
}
