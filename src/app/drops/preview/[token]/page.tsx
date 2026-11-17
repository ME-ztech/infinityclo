import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';

import { listDrops } from '@/server/records';
import { safeEqual } from '@/server/security';

export const metadata: Metadata = {
  title: 'Drop preview',
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = 'force-dynamic';

/**
 * Private preview of a drop teaser.
 *
 * Reached only with the drop's unguessable preview token, which staff copy from
 * the back office. It is never linked from the storefront, is excluded from
 * search engines, and shows the same public fields the homepage teaser would —
 * the internal working name is not rendered.
 */
export default async function DropPreviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{32}$/.test(token)) notFound();
  const drop = (await listDrops()).find((candidate) => safeEqual(candidate.previewToken, token));
  if (!drop) notFound();

  const release = drop.releaseConfirmed && drop.releaseAt ? new Date(drop.releaseAt) : null;

  return (
    <div className="edge pt-14 pb-(--spacing-section) md:pt-20" data-testid="drop-preview">
      <p role="status" className="border-line text-fg-muted mx-auto mb-10 max-w-2xl border p-4 text-center text-xs leading-relaxed">
        Private preview — this page is not public and is not indexed. Current stage:{' '}
        <strong className="text-fg">{drop.stage.replace('_', ' ')}</strong>. Customers see this teaser on the homepage only
        while the drop is “coming soon” or “early access”.
      </p>

      <div className="mx-auto max-w-2xl text-center">
        <p className="text-fg-muted text-[0.72rem] font-semibold tracking-[0.2em] uppercase">
          {drop.stage === 'early_access' ? 'Early access' : 'Coming soon'}
        </p>
        {drop.publicName && <h1 className="font-display text-headline text-fg mt-4">{drop.publicName}</h1>}
        {drop.teaser && <p className="text-fg-muted mt-6 text-base leading-relaxed">{drop.teaser}</p>}
        {release && (
          <p className="text-fg mt-6 text-sm font-semibold">
            {release.toLocaleString('en-CA', { dateStyle: 'long', timeStyle: 'short' })}
          </p>
        )}
        {drop.image && (
          <Image
            src={drop.image.url}
            alt={drop.image.alt}
            width={drop.image.width}
            height={drop.image.height}
            className="mx-auto mt-10 h-auto w-full max-w-md"
          />
        )}
        {!drop.publicName && !drop.teaser && !drop.image && !release && (
          <p className="text-fg-muted mt-6 text-sm">
            Nothing has been filled in yet, so customers would see only “Coming soon”
            {drop.waitlistEnabled ? ' and the waitlist form' : ''}.
          </p>
        )}
        {drop.waitlistEnabled && (
          <p className="text-fg-muted mt-10 text-xs">The waitlist form appears here on the live homepage.</p>
        )}
      </div>
    </div>
  );
}
