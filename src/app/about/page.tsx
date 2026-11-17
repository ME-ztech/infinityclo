import type { Metadata } from 'next';

import { NewsletterForm } from '@/components/newsletter/NewsletterForm';
import { ButtonLink } from '@/components/ui/Button';
import { Emblem } from '@/components/ui/Wordmark';
import { NEWSLETTER_CONSENT_TEXT } from '@/server/records';

export const metadata: Metadata = {
  title: 'About',
  description:
    'INFNITY is where raw identity meets untouchable design. Streetwear from Winnipeg, Manitoba. Be the Statement.',
  alternates: { canonical: '/about' },
};

/**
 * Brand story.
 *
 * Every line here is the brand's own published language — its store
 * description, its slogan, where it is based and its community invitation.
 * No founder story, origin date or mission has been written on its behalf;
 * docs/assets-and-rights.md lists what the owner can add.
 */
export default function AboutPage() {
  return (
    <div className="edge pb-(--spacing-section)">
      <section className="mx-auto flex max-w-3xl flex-col items-center pt-16 pb-14 text-center md:pt-24">
        <Emblem className="mb-8 h-16 md:h-20" priority />
        <h1 className="font-display text-statement text-fg">Be the Statement</h1>
      </section>

      <section className="border-line mx-auto max-w-2xl border-t py-14 text-center">
        <p className="font-display text-title text-fg text-balance">
          Where raw identity meets untouchable design.
        </p>
        <p className="text-fg-muted mx-auto mt-7 max-w-xl text-base leading-relaxed">
          Built for the ones who don’t fold, don’t follow — and never settle.
        </p>
        <p className="text-fg-muted mx-auto mt-4 max-w-xl text-base leading-relaxed">
          For the FLY only. Question is… you got what it takes to be one?
        </p>
        <p className="text-fg-faint mt-8 text-[0.7rem] font-semibold tracking-[0.24em] uppercase">
          Based in Winnipeg, Manitoba, Canada
        </p>
        <div className="mt-9 flex justify-center">
          <ButtonLink href="/shop" size="lg">
            Enter the Vault
          </ButtonLink>
        </div>
      </section>

      <section className="border-line mx-auto max-w-2xl border-t py-14 text-center">
        <h2 className="font-display text-headline text-fg">The Troop in INFNITY</h2>
        <p className="text-fg-muted mx-auto mt-6 max-w-xl text-base leading-relaxed">
          Styled By You is the wall of people wearing it. Wanna be added to the wall? Post and tag
          us @infnity.clo.
        </p>
        <div className="mt-8 flex justify-center">
          <ButtonLink href="/community" variant="secondary" size="lg">
            Styled By You
          </ButtonLink>
        </div>
      </section>

      <section className="border-line mx-auto max-w-xl border-t pt-14 text-center">
        <h2 className="font-display text-headline text-fg">Join the Troop</h2>
        <p className="text-fg-muted mt-5 text-sm leading-relaxed">
          Early access to the next drop. Email only, unsubscribe any time.
        </p>
        <NewsletterForm
          source="about"
          consentText={NEWSLETTER_CONSENT_TEXT}
          align="center"
          className="mt-7"
        />
      </section>
    </div>
  );
}
