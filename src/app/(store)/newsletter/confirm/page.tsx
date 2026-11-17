import type { Metadata } from 'next';
import Link from 'next/link';

import { confirm } from '@/server/newsletter';

export const metadata: Metadata = { title: 'Confirm subscription', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const ok = token ? await confirm(token.slice(0, 100)).catch(() => false) : false;
  return (
    <div className="edge mx-auto max-w-lg py-24 text-center">
      <h1 className="font-display text-4xl">{ok ? 'You’re in' : 'Link expired'}</h1>
      <p className="text-fg-muted mt-4 text-sm">
        {ok
          ? 'Your early-access subscription is confirmed. You’ll hear about the next drop first.'
          : 'This confirmation link is invalid or has already been used.'}
      </p>
      <Link href="/shop" className="font-display mt-8 inline-block underline underline-offset-4">
        Enter the Vault
      </Link>
    </div>
  );
}
