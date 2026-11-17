import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { DropCountdown } from '@/components/home/DropCountdown';
import { Hero } from '@/components/home/Hero';
import { WaitlistForm } from '@/components/home/WaitlistForm';
import { Section } from '@/components/layout/Section';
import { NewsletterForm } from '@/components/newsletter/NewsletterForm';
import { ProductRack } from '@/components/product/ProductRack';
import { TroopGallery } from '@/components/troop/TroopGallery';
import { ButtonLink, TextLink } from '@/components/ui/Button';
import { Reveal } from '@/components/ui/Reveal';
import { getSiteContent, type HomepageSectionId } from '@/server/cms';
import { NEWSLETTER_CONSENT_TEXT, WAITLIST_CONSENT_TEXT, listPublicDrops } from '@/server/records';
import { getCommunityWall, getFeaturedProducts } from '@/server/storefront';

export const revalidate = 60;

/**
 * Homepage.
 *
 * Nothing here is hard-coded: the section order and on/off state, every
 * headline, the hero slides, the featured products and the lookbook all come
 * from the CMS document the owner edits in /admin. A section with nothing real
 * to show — no lookbook images, no community photos, no upcoming drop — is
 * skipped rather than padded.
 */
export default async function HomePage() {
  const content = await getSiteContent();
  const [featured, wall, drops] = await Promise.all([
    getFeaturedProducts(content, 8),
    getCommunityWall(8),
    listPublicDrops(),
  ]);

  const slides = content.hero.slides.filter((slide) => slide.enabled);

  const sections: Record<HomepageSectionId, () => ReactNode> = {
    hero: () => (
      <Hero key="hero" slides={slides} autoAdvanceSeconds={content.hero.autoAdvanceSeconds} />
    ),

    statement: () =>
      content.statement.headline ? (
        <Section key="statement" surface="paper" aria-labelledby="statement-heading">
          <Reveal className="mx-auto max-w-3xl text-center">
            <h2
              id="statement-heading"
              className="font-display text-fg text-[clamp(2.5rem,9vw,6rem)] leading-[0.9] text-balance"
            >
              {content.statement.headline}
            </h2>
            {content.statement.body && (
              <p className="text-fg-muted mx-auto mt-7 max-w-xl text-[0.95rem] leading-relaxed text-pretty">
                {content.statement.body}
              </p>
            )}
          </Reveal>
        </Section>
      ) : null,

    featured: () =>
      featured.length > 0 ? (
        <Section
          key="featured"
          surface="paper"
          spacing="tight"
          aria-labelledby="featured-heading"
          data-testid="home-featured"
        >
          <CenteredHeading id="featured-heading" title={content.featured.heading} />
          <ProductRack products={featured} priorityCount={0} columns={4} />
          <div className="mt-10 flex justify-center">
            <TextLink href="/shop">Shop all</TextLink>
          </div>
        </Section>
      ) : null,

    vault: () => (
      <Section key="vault" surface="ink" aria-labelledby="vault-heading" data-testid="home-vault">
        <Reveal className="mx-auto flex max-w-2xl flex-col items-center text-center">
          <h2
            id="vault-heading"
            className="font-display text-fg text-[clamp(2.5rem,9vw,5.5rem)] leading-[0.9]"
          >
            {content.vault.heading}
          </h2>
          {content.vault.body && (
            <p className="text-fg-muted mt-6 max-w-md text-sm leading-relaxed">
              {content.vault.body}
            </p>
          )}
          <ButtonLink href="/shop" size="lg" className="mt-9">
            {content.vault.ctaLabel || 'Enter the Vault'}
          </ButtonLink>
        </Reveal>
      </Section>
    ),

    lookbook: () =>
      content.lookbook.images.length > 0 ? (
        <Section
          key="lookbook"
          surface="paper"
          bleed
          spacing="tight"
          aria-labelledby="lookbook-heading"
          data-testid="home-lookbook"
        >
          <div className="edge">
            <CenteredHeading
              id="lookbook-heading"
              title={content.lookbook.heading}
              lede={content.lookbook.body}
            />
          </div>
          <ul className="grid grid-cols-2 gap-px md:grid-cols-3">
            {content.lookbook.images.map((image, index) => {
              const frame = (
                <div className="bg-surface-sunken relative aspect-[4/5] overflow-hidden">
                  <Image
                    src={image.url}
                    alt={image.alt}
                    fill
                    sizes="(min-width: 768px) 33vw, 50vw"
                    className="object-cover object-top transition-transform duration-700 ease-(--ease-brand) group-hover:scale-[1.03]"
                  />
                </div>
              );
              return (
                <li key={`${image.url}-${index}`}>
                  {image.productSlug ? (
                    <Link
                      href={`/products/${image.productSlug}`}
                      className="group block"
                      aria-label={`Shop this look: ${image.alt}`}
                    >
                      {frame}
                    </Link>
                  ) : (
                    <div className="group">{frame}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null,

    community: () =>
      wall.length > 0 ? (
        <Section
          key="community"
          surface="paper"
          spacing="tight"
          aria-labelledby="community-heading"
          data-testid="home-community"
        >
          <CenteredHeading
            id="community-heading"
            title={content.community.heading}
            lede={content.community.body}
          />
          <TroopGallery entries={wall} />
          <div className="mt-10 flex justify-center">
            <ButtonLink href="/community" variant="secondary" size="lg">
              See the wall
            </ButtonLink>
          </div>
        </Section>
      ) : null,

    'coming-soon': () =>
      drops.length > 0 ? (
        <Section
          key="coming-soon"
          surface="bone"
          aria-labelledby="coming-soon-heading"
          data-testid="home-coming-soon"
        >
          <CenteredHeading id="coming-soon-heading" title="Coming soon" />
          <div className="mx-auto flex max-w-5xl flex-col gap-16">
            {drops.map((drop) => (
              <article
                key={drop.id}
                className={
                  drop.image
                    ? 'grid items-center gap-8 md:grid-cols-2 md:gap-14'
                    : 'mx-auto w-full max-w-xl text-center'
                }
              >
                {drop.image && (
                  <div className="bg-surface-sunken relative aspect-[4/5] overflow-hidden">
                    <Image
                      src={drop.image.url}
                      alt={drop.image.alt}
                      fill
                      sizes="(min-width: 768px) 50vw, 100vw"
                      className="object-cover"
                    />
                  </div>
                )}
                <div>
                  <p className="text-fg-faint text-[0.66rem] font-semibold tracking-[0.3em] uppercase">
                    {drop.stage === 'early_access' ? 'Early access' : 'Next drop'}
                  </p>
                  {/* The name, teaser and date appear only once the owner has
                      set them. Nothing about an unreleased product is assumed. */}
                  {drop.publicName && (
                    <h3 className="font-display text-headline text-fg mt-3">{drop.publicName}</h3>
                  )}
                  {drop.teaser && (
                    <p className="text-fg-muted mt-4 text-sm leading-relaxed">{drop.teaser}</p>
                  )}
                  {drop.releaseConfirmed && drop.releaseAt && (
                    <DropCountdown releaseAt={drop.releaseAt} className="mt-6" />
                  )}
                  {drop.waitlistEnabled && (
                    <WaitlistForm
                      dropId={drop.id}
                      consentText={WAITLIST_CONSENT_TEXT}
                      className="mt-7"
                    />
                  )}
                </div>
              </article>
            ))}
          </div>
        </Section>
      ) : null,

    newsletter: () => (
      <Section
        key="newsletter"
        surface="paper"
        aria-labelledby="newsletter-heading"
        data-testid="home-newsletter"
      >
        <div className="mx-auto max-w-xl text-center">
          <h2 id="newsletter-heading" className="font-display text-headline text-fg">
            {content.newsletter.heading}
          </h2>
          {content.newsletter.body && (
            <p className="text-fg-muted mt-5 text-sm leading-relaxed">{content.newsletter.body}</p>
          )}
          <NewsletterForm
            source="homepage"
            consentText={NEWSLETTER_CONSENT_TEXT}
            align="center"
            className="mt-8"
          />
        </div>
      </Section>
    ),
  };

  return (
    <>
      {content.sections.filter((section) => section.enabled).map((section) => sections[section.id]())}
    </>
  );
}

function CenteredHeading({ id, title, lede }: { id: string; title: string; lede?: string }) {
  return (
    <div className="mx-auto mb-10 max-w-2xl text-center md:mb-14">
      <h2 id={id} className="font-display text-headline text-fg text-balance">
        {title}
      </h2>
      {lede && <p className="text-fg-muted mt-4 text-sm leading-relaxed text-pretty">{lede}</p>}
    </div>
  );
}
