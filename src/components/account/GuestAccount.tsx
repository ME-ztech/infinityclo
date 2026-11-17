import { AccountShell, authErrorMessage, SignedOutPanel } from '@/components/account/AccountShell';
import { hostedAccountUrl, type AccountContext } from '@/server/customer/context';

/**
 * What every account page renders for a visitor who is not signed in.
 * Server component: it resolves the Shopify-hosted account URL from config.
 */
export function GuestAccount({
  title,
  current,
  context,
  error,
  signedOut,
}: {
  title: string;
  current: string;
  context: Exclude<AccountContext, { state: 'signed_in' }>;
  error?: string;
  signedOut?: boolean;
}) {
  return (
    <AccountShell
      title={title}
      current={current}
      signedIn={false}
      error={authErrorMessage(error)}
      notice={signedOut ? 'You have been signed out.' : null}
    >
      <SignedOutPanel
        configured={context.state !== 'unconfigured'}
        hostedAccountUrl={hostedAccountUrl()}
        returnTo={current}
      />
    </AccountShell>
  );
}

const CURRENCY_LOCALE = 'en-CA';

export function formatAmount(value: { amount: string; currencyCode: string } | null | undefined): string {
  if (!value) return '—';
  const amount = Number(value.amount);
  if (!Number.isFinite(amount)) return '—';
  try {
    return new Intl.NumberFormat(CURRENCY_LOCALE, { style: 'currency', currency: value.currencyCode }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${value.currencyCode}`;
  }
}

export function formatDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(CURRENCY_LOCALE, {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' } : {}),
    timeZone: 'America/Winnipeg',
  }).format(date);
}

/** `searchParams` values arrive as string | string[] | undefined. */
export const firstParam = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;
