import type { Metadata } from 'next';

import { CommunitySubmitForm } from '@/components/troop/CommunitySubmitForm';
import { TroopGallery } from '@/components/troop/TroopGallery';
import { ButtonLink } from '@/components/ui/Button';
import { INSTAGRAM_HANDLE, INSTAGRAM_URL } from '@/lib/site';
import { getSiteContent } from '@/server/cms';
import { COMMUNITY_CONSENT_TEXT } from '@/server/records';
import { getCommunityWall } from '@/server/storefront';

export const metadata: Metadata = {
  title: 'Styled By You',
  description: 'The Troop in INFNITY — the community wall. Post and tag @infnity.clo to be added.',
  alternates: { canonical: '/community' },
};

export const revalidate = 60;

/**
 * Styled By You — the Troop's wall.
 *
 * The wall is the one the brand already runs on infinityclo.ca, plus any
 * submission staff have approved. Entries staff hide in admin drop out within a
 * minute. A handle is credited only when its owner asked for that.
 */
export default async function CommunityPage() {
  const [content, wall] = await Promise.all([getSiteContent(), getCommunityWall()]);

  return (
    <div className="edge pb-(--spacing-section)">
      <header className="mx-auto max-w-2xl pt-12 pb-12 text-center md:pt-20 md:pb-16">
        <p className="text-fg-faint mb-4 text-[0.7rem] font-semibold tracking-[0.3em] uppercase">
          The Troop in INFNITY
        </p>
        <h1 className="font-display text-statement text-fg">Styled By You</h1>
        <p className="text-fg-muted mx-auto mt-6 max-w-lg text-sm leading-relaxed md:text-base">
          {content.community.body}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <ButtonLink href="#submit" size="lg">
            Add your photo
          </ButtonLink>
          <ButtonLink
            href={content.social.instagram || INSTAGRAM_URL}
            variant="secondary"
            size="lg"
            target="_blank"
            rel="noopener noreferrer"
          >
            {INSTAGRAM_HANDLE}
          </ButtonLink>
        </div>
      </header>

      {wall.length > 0 ? (
        <TroopGallery entries={wall} />
      ) : (
        <p className="text-fg-muted py-16 text-center text-sm">
          The wall is empty right now. Be the first — send your photo below.
        </p>
      )}

      <section
        id="submit"
        aria-labelledby="submit-heading"
        className="border-line mx-auto mt-(--spacing-section) max-w-2xl scroll-mt-28 border-t pt-14"
      >
        <div className="text-center">
          <h2 id="submit-heading" className="font-display text-headline text-fg">
            Get on the wall
          </h2>
          <p className="text-fg-muted mx-auto mt-5 max-w-lg text-sm leading-relaxed">
            Send us your fit. Every photo is reviewed before it appears, and you can ask for it to
            be taken down at any time.
          </p>
        </div>
        <div className="mt-9">
          <CommunitySubmitForm consentText={COMMUNITY_CONSENT_TEXT} />
        </div>
      </section>
    </div>
  );
}
