import type { Metadata } from 'next';

import { unsubscribeByToken } from '@/server/newsletter';

export const metadata: Metadata = { title: 'Unsubscribe', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const ok = token ? await unsubscribeByToken(token.slice(0, 100)).catch(() => false) : false;
  return (
    <div className="edge mx-auto max-w-lg py-24 text-center">
      <h1 className="font-display text-4xl">{ok ? 'Unsubscribed' : 'Link not recognised'}</h1>
      <p className="text-fg-muted mt-4 text-sm">
        {ok
          ? 'You won’t get INFNITY marketing emails any more. Order and shipping emails still arrive.'
          : 'This unsubscribe link is invalid. Contact us and we’ll remove you by hand.'}
      </p>
    </div>
  );
}
