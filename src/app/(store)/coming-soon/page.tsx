import type { Metadata } from 'next';
import Image from 'next/image';

import { Countdown } from '@/components/drops/Countdown';
import { WaitlistForm } from '@/components/drops/WaitlistForm';
import { NewsletterForm } from '@/components/newsletter/NewsletterForm';
import { publicTeasers } from '@/server/drops';

export const metadata: Metadata = { title: 'Coming soon', description: 'The next INFNITY drop.', alternates: { canonical: '/coming-soon' } };
export const revalidate = 120;

export default async function ComingSoonPage() {
  const drops = await publicTeasers();
  return (
    <div className="edge pt-14 pb-(--spacing-section) md:pt-20">
      <header className="mx-auto max-w-2xl text-center">
        <h1 className="font-display text-[clamp(2.6rem,9vw,5.4rem)] leading-[0.88]">Coming soon</h1>
      </header>
      {drops.length === 0 ? (
        <div className="mx-auto mt-10 max-w-md text-center" data-testid="no-drops">
          <p className="text-fg-muted text-sm leading-relaxed">Nothing has been announced yet. Join early access and you’ll hear first.</p>
          <NewsletterForm source="coming-soon" className="mt-8" />
        </div>
      ) : (
        <ul className="mx-auto mt-12 flex max-w-5xl flex-col gap-16">
          {drops.map((drop) => (
            <li key={drop.id} className="grid items-center gap-10 md:grid-cols-2" data-testid="drop-teaser">
              {drop.mediaUrl && (
                <div className="bg-surface-sunken relative aspect-[4/5] overflow-hidden">
                  <Image src={drop.mediaUrl} alt={drop.mediaAlt ?? drop.name} fill sizes="(min-width: 768px) 45vw, 100vw" className="object-cover" />
                </div>
              )}
              <div className={drop.mediaUrl ? 'text-center md:text-left' : 'text-center md:col-span-2'}>
                <p className="text-fg-faint text-[0.66rem] font-semibold tracking-[0.32em] uppercase">{drop.status === 'early_access' ? 'Early access' : 'Coming soon'}</p>
                <h2 className="font-display mt-3 text-[clamp(2rem,6vw,3.4rem)] leading-[0.92]">{drop.headline || drop.name}</h2>
                {drop.body && <p className="text-fg-muted mt-4 text-sm leading-relaxed">{drop.body}</p>}
                {drop.releaseConfirmed && drop.releaseAt && <Countdown target={drop.releaseAt.toISOString()} className="mt-6" />}
                {drop.waitlistEnabled && <WaitlistForm slug={drop.slug} className="mx-auto mt-8 md:mx-0" />}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
