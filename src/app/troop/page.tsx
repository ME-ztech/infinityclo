import type { Metadata } from 'next';

import { NewsletterForm } from '@/components/newsletter/NewsletterForm';
import { TroopGallery } from '@/components/troop/TroopGallery';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { contentRepository } from '@/data';

export const metadata: Metadata = {
  title: 'The Troop',
  description: 'Styled by you. Real INFNITY customers, real fits.',
  alternates: { canonical: '/troop' },
};

export const revalidate = 3600;

export default async function TroopPage() {
  const entries = await contentRepository.listUGC();

  return (
    <div>
      <section className="edge flex min-h-[55svh] items-end pt-28 pb-14 md:pt-36">
        <div>
          <p className="text-dim mb-5 text-[0.7rem] font-semibold tracking-[0.3em] uppercase">
            Styled by you
          </p>
          <h1 className="font-display text-statement text-paper">The Troop</h1>
          <p className="text-smoke mt-7 max-w-lg text-sm leading-relaxed md:text-base">
            The people wearing it. Real fits, real customers — the clearest picture of what INFNITY
            actually looks like on.
          </p>
        </div>
      </section>

      <div className="edge pb-[--spacing-section]">
        {entries.length > 0 ? (
          <TroopGallery entries={entries} />
        ) : (
          <EmptyState
            title="The gallery is waiting"
            body={
              <>
                Customer imagery has not been imported into this build. This gallery shows real
                INFNITY customers only — nothing has been staged or substituted while the real
                material is unavailable.
              </>
            }
            action={
              <ButtonLink href="/shop" variant="primary" size="md">
                Shop the pieces
              </ButtonLink>
            }
          />
        )}

        {/* Submission surface. The UI is real; submissions open once
            authentication and moderation land in Phase 2, and the copy says so
            rather than accepting uploads nothing can receive. */}
        <section
          aria-labelledby="submit-heading"
          className="border-ash/50 mt-[--spacing-section] border p-8 md:p-14"
        >
          <div className="max-w-xl">
            <h2 id="submit-heading" className="font-display text-headline text-paper">
              Get featured
            </h2>
            <p className="text-smoke mt-5 text-sm leading-relaxed">
              Submissions open with the next drop. Join the list and you&apos;ll be first to know
              when the gallery opens up.
            </p>
            <NewsletterForm source="troop" className="mt-7" />
          </div>
        </section>
      </div>
    </div>
  );
}
