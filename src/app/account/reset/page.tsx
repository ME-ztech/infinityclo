import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AuthCard, FIELD, LABEL, SUBMIT, param, type SearchParams } from '@/components/account/AccountShell';

import { resetPasswordAction } from '../actions';

export const metadata: Metadata = { title: 'Choose a new password', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function ResetPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const token = param(params, 'token');
  if (!token) redirect('/account/forgot');

  return (
    <AuthCard title="New password" intro="Choose a new password for your account." error={param(params, 'error')}>
      <form action={resetPasswordAction} className="space-y-5" data-testid="reset-form">
        <input type="hidden" name="token" value={token} />
        <div>
          <label htmlFor="reset-password" className={LABEL}>
            New password
          </label>
          <input
            id="reset-password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            aria-describedby="reset-hint"
            className={FIELD}
          />
          <p id="reset-hint" className="text-fg-muted mt-2 text-xs">
            At least 12 characters. Setting it signs you out everywhere else.
          </p>
        </div>
        <button type="submit" className={`${SUBMIT} w-full`}>
          Save password
        </button>
      </form>
    </AuthCard>
  );
}
