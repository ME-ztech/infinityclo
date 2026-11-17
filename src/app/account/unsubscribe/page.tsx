import type { Metadata } from 'next';

import { SUBMIT } from '@/components/account/AccountShell';
import { firstParam } from '@/components/account/GuestAccount';
import { ButtonLink } from '@/components/ui/Button';
import { isValidUnsubscribeToken } from '@/server/customer/newsletter';
import { maskEmail, normaliseEmail } from '@/server/security';

export const metadata: Metadata = { title: 'Unsubscribe' };

/**
 * Unsubscribe confirmation.
 *
 * Opening the link changes nothing — mail scanners follow links — so the
 * person confirms with a button, which posts the signed token. The address is
 * shown masked, and only when the token proves the visitor was sent this link.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const done = firstParam(params.done);
  const email = normaliseEmail(firstParam(params.email));
  const token = firstParam(params.token) ?? '';
  const valid = Boolean(email && isValidUnsubscribeToken(email, token));

  return (
    <div className="edge pt-14 pb-(--spacing-section) text-center md:pt-20">
      <h1 className="font-display text-headline text-fg mb-8">Unsubscribe</h1>
      <div className="border-line mx-auto max-w-xl border p-8 md:p-12">
        {done === '1' ? (
          <p role="status" className="text-fg text-sm leading-relaxed">
            You have been unsubscribed from INFNITY marketing emails. Order and shipping emails are
            not affected.
          </p>
        ) : done === '0' || !valid ? (
          <p role="alert" className="text-fg-muted text-sm leading-relaxed">
            This unsubscribe link is not valid or has been altered. Use the link in the most recent
            email we sent you, or contact us and we will remove you.
          </p>
        ) : (
          <form action="/api/newsletter/unsubscribe" method="post">
            <input type="hidden" name="email" value={email!} />
            <input type="hidden" name="token" value={token} />
            <p className="text-fg-muted mb-6 text-sm leading-relaxed">
              Stop marketing emails to <span className="text-fg">{maskEmail(email!)}</span>?
            </p>
            <button type="submit" className={SUBMIT}>
              Unsubscribe
            </button>
          </form>
        )}
        <div className="mt-8">
          <ButtonLink href="/" variant="secondary" size="md">
            Back to the store
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
