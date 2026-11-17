import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AuthCard, SUBMIT, param, type SearchParams } from '@/components/account/AccountShell';

import { verifyAction } from '../actions';

export const metadata: Metadata = { title: 'Confirm your email', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Opening the emailed link does not confirm anything by itself: mail scanners
 * and link previewers follow links, and would burn the single-use token before
 * the person arrived. Confirmation is the button press below.
 */
export default async function VerifyPage({ searchParams }: { searchParams: SearchParams }) {
  const token = param(await searchParams, 'token');
  if (!token) redirect('/account/login');

  return (
    <AuthCard title="Confirm your email" intro="One more step to finish creating your INFNITY account.">
      <form action={verifyAction} data-testid="verify-form">
        <input type="hidden" name="token" value={token} />
        <button type="submit" className={`${SUBMIT} w-full`}>
          Confirm email address
        </button>
      </form>
    </AuthCard>
  );
}
