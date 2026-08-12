import type { Metadata } from 'next';

import { NewsletterForm } from '@/components/newsletter/NewsletterForm';
import { ButtonLink } from '@/components/ui/Button';

export const metadata: Metadata = {
  title: 'About',
  description: 'INFNITY — raw identity, heavyweight construction. Be the Statement.',
  alternates: { canonical: '/about' },
};

/**
 * Brand story.
 *
 * The structure is complete; the content is limited to what the brand itself
 * says publicly. No founding date, founder biography, city of origin or
 * production story appears here, because none of that could be verified from
 * the source material available. Those sections are held open and the questions
 * needed to fill them are in docs/BRAND_STORY_INPUTS_NEEDED.md.
 */
export default function AboutPage() {
  return (
    <div>
      <section
        data-surface="bone"
        className="bg-surface edge flex min-h-[54svh] items-end pt-20 pb-16 md:pt-24"
      >
        <div>
          <p className="text-fg-faint mb-5 text-[0.7rem] font-semibold tracking-[0.3em] uppercase">
            The label
          </p>
          <h1 className="font-display text-statement text-fg max-w-[14ch]">Be the Statement</h1>
        </div>
      </section>

      <div className="edge pb-(--spacing-section)">
        <div className="grid gap-12 md:grid-cols-[1fr_1.4fr] md:gap-20">
          <div>
            <h2 className="text-fg-faint text-[0.68rem] font-semibold tracking-[0.24em] uppercase">
              What it is
            </h2>
          </div>

          <div className="max-w-2xl">
            <p className="font-display text-title text-fg">
              Raw identity meets untouchable design.
            </p>
            <p className="text-fg-muted mt-7 text-sm leading-relaxed md:text-base">
              INFNITY is a streetwear label built for people who don&apos;t fold, don&apos;t follow,
              and never settle. The pieces are made to be worn hard and to still read as a statement
              — heavyweight where it matters, quiet where it doesn&apos;t.
            </p>
            <p className="text-fg-muted mt-5 text-sm leading-relaxed md:text-base">
              The name is the point. Infinity without the second <em>i</em> — the mark is
              deliberately incomplete, because the people wearing it are still becoming who they
              are.
            </p>
          </div>
        </div>

        <div className="border-line mt-(--spacing-section) grid gap-12 border-t pt-16 md:grid-cols-[1fr_1.4fr] md:gap-20">
          <div>
            <h2 className="text-fg-faint text-[0.68rem] font-semibold tracking-[0.24em] uppercase">
              The Troop
            </h2>
          </div>

          <div className="max-w-2xl">
            <p className="font-display text-title text-fg">The label is the people.</p>
            <p className="text-fg-muted mt-7 text-sm leading-relaxed md:text-base">
              The Troop is the community around INFNITY — the customers who wear it and make it mean
              something. Their fits sit alongside the campaign imagery because they are the
              campaign.
            </p>
            <div className="mt-8">
              <ButtonLink href="/troop" variant="secondary" size="md">
                See the Troop
              </ButtonLink>
            </div>
          </div>
        </div>

        <div className="border-line mt-(--spacing-section) border-t pt-16">
          <div className="max-w-xl">
            <h2 className="font-display text-headline text-fg">Join the Troop</h2>
            <p className="text-fg-muted mt-5 text-sm leading-relaxed">
              Early access. Private drops. Restocks. No noise.
            </p>
            <NewsletterForm source="about" className="mt-7" />
          </div>
        </div>
      </div>
    </div>
  );
}
