import type { Metadata } from 'next';

import { AccountShell, FIELD, LABEL, SECONDARY_SUBMIT, SUBMIT, Unavailable } from '@/components/account/AccountShell';
import { GuestAccount } from '@/components/account/GuestAccount';
import { accountContext, loadForPage } from '@/server/customer/context';
import { readFlash } from '@/server/customer/session';

export const metadata: Metadata = { title: 'Profile' };

const PAGE = '/account/profile';
const ACTION = '/api/account/profile';

/**
 * Profile and communication preferences.
 *
 * Two separate forms on purpose: editing a name must never touch marketing
 * consent, and marketing consent is only ever changed by its own explicit
 * button.
 */
export default async function ProfilePage() {
  const context = await accountContext(PAGE);
  if (context.state !== 'signed_in') return <GuestAccount title="Profile" current={PAGE} context={context} />;

  const loaded = await loadForPage(PAGE, () => context.gateway.getProfile(context.session.accessToken));
  if ('error' in loaded) {
    return (
      <AccountShell title="Profile" current={PAGE} signedIn>
        <Unavailable message={loaded.error} />
      </AccountShell>
    );
  }

  const profile = loaded.data;
  const flash = await readFlash();
  const subscribed = profile.marketingState === 'SUBSCRIBED';

  return (
    <AccountShell title="Profile" current={PAGE} signedIn notice={flash.notice} error={flash.error}>
      <section className="border-line border p-6 md:p-8" aria-labelledby="profile-name">
        <h2 id="profile-name" className="font-display text-fg mb-6 text-xl">
          Your name
        </h2>
        <form action={ACTION} method="post" className="space-y-4">
          <input type="hidden" name="intent" value="profile" />
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="profile-first" className={LABEL}>
                First name
              </label>
              <input id="profile-first" name="firstName" defaultValue={profile.firstName ?? ''} required maxLength={60} autoComplete="given-name" className={FIELD} />
            </div>
            <div>
              <label htmlFor="profile-last" className={LABEL}>
                Last name
              </label>
              <input id="profile-last" name="lastName" defaultValue={profile.lastName ?? ''} required maxLength={60} autoComplete="family-name" className={FIELD} />
            </div>
          </div>
          <div>
            <p className={LABEL}>Email</p>
            <p className="text-fg break-all text-sm">{profile.email ?? 'Not set'}</p>
            <p className="text-fg-muted mt-1 text-xs">
              Your email is your sign-in. It is managed by Shopify and cannot be changed here.
            </p>
          </div>
          <button type="submit" className={SUBMIT}>
            Save name
          </button>
        </form>
      </section>

      <section className="border-line mt-8 border p-6 md:p-8" aria-labelledby="profile-marketing">
        <h2 id="profile-marketing" className="font-display text-fg mb-4 text-xl">
          Marketing emails
        </h2>
        <p className="text-fg-muted text-sm leading-relaxed" data-testid="profile-marketing-state">
          {subscribed
            ? 'You are subscribed to emails about drops and offers.'
            : profile.marketingState === 'PENDING'
              ? 'Your subscription is awaiting confirmation.'
              : 'You are not subscribed to emails about drops and offers.'}
        </p>
        <p className="text-fg-muted mt-2 text-sm leading-relaxed">
          This only affects marketing. Order confirmations and shipping updates are always sent.
        </p>
        <form action={ACTION} method="post" className="mt-6">
          <input type="hidden" name="intent" value="marketing" />
          <input type="hidden" name="subscribe" value={subscribed ? 'no' : 'yes'} />
          {!subscribed && (
            <p className="text-fg-muted mb-4 text-xs leading-relaxed">
              By subscribing you agree to receive marketing emails from INFNITY about drops and
              offers. You can unsubscribe at any time.
            </p>
          )}
          <button type="submit" className={subscribed ? SECONDARY_SUBMIT : SUBMIT}>
            {subscribed ? 'Unsubscribe' : 'Subscribe'}
          </button>
        </form>
      </section>
    </AccountShell>
  );
}
