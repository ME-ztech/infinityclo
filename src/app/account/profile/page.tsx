import type { Metadata } from 'next';

import { AccountShell, FIELD, LABEL, SUBMIT, param, type SearchParams } from '@/components/account/AccountShell';
import { requireCustomerPage } from '@/server/commerce/session';
import { NEWSLETTER_CONSENT_TEXT } from '@/server/records';

import { changePasswordAction, updateProfileAction } from '../actions';

export const metadata: Metadata = { title: 'Profile', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function ProfilePage({ searchParams }: { searchParams: SearchParams }) {
  const customer = await requireCustomerPage('/account/profile');
  const params = await searchParams;

  return (
    <AccountShell title="Profile" current="/account/profile" signedIn notice={param(params, 'notice')} error={param(params, 'error')}>
      <form action={updateProfileAction} className="max-w-xl space-y-5" data-testid="profile-form">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="profile-first" className={LABEL}>
              First name
            </label>
            <input id="profile-first" name="firstName" autoComplete="given-name" defaultValue={customer.firstName} className={FIELD} />
          </div>
          <div>
            <label htmlFor="profile-last" className={LABEL}>
              Last name
            </label>
            <input id="profile-last" name="lastName" autoComplete="family-name" defaultValue={customer.lastName} className={FIELD} />
          </div>
        </div>
        <div>
          <label htmlFor="profile-phone" className={LABEL}>
            Phone (optional)
          </label>
          <input id="profile-phone" name="phone" type="tel" autoComplete="tel" defaultValue={customer.phone ?? ''} className={FIELD} />
        </div>
        <div>
          <p className={LABEL}>Email</p>
          <p className="text-fg text-sm">{customer.email}</p>
        </div>
        <fieldset className="border-line border p-4">
          <legend className="text-fg-muted px-2 text-[0.68rem] font-semibold tracking-[0.16em] uppercase">Marketing emails</legend>
          <label className="text-fg-muted flex items-start gap-3 text-sm leading-snug">
            <input type="checkbox" name="marketingConsent" defaultChecked={customer.marketingConsent} className="mt-1 h-4 w-4" />
            <span>{NEWSLETTER_CONSENT_TEXT}</span>
          </label>
          <p className="text-fg-muted mt-3 text-xs">
            Order confirmations and shipping updates are sent either way.
          </p>
        </fieldset>
        <button type="submit" className={SUBMIT}>
          Save profile
        </button>
      </form>

      <form action={changePasswordAction} className="border-line mt-14 max-w-xl space-y-5 border-t pt-10" data-testid="password-form">
        <h2 className="font-display text-fg text-2xl">Change password</h2>
        <div>
          <label htmlFor="profile-current" className={LABEL}>
            Current password
          </label>
          <input id="profile-current" name="currentPassword" type="password" autoComplete="current-password" required className={FIELD} />
        </div>
        <div>
          <label htmlFor="profile-new" className={LABEL}>
            New password
          </label>
          <input id="profile-new" name="newPassword" type="password" autoComplete="new-password" required minLength={12} className={FIELD} />
          <p className="text-fg-muted mt-2 text-xs">At least 12 characters. Other devices will be signed out.</p>
        </div>
        <button type="submit" className={SUBMIT}>
          Change password
        </button>
      </form>
    </AccountShell>
  );
}
