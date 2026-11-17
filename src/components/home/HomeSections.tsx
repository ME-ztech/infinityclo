import Image from 'next/image';
import Link from 'next/link';

import { WaitlistForm } from '@/components/drops/WaitlistForm';
import { Section } from '@/components/layout/Section';
import { NewsletterForm } from '@/components/newsletter/NewsletterForm';
import { ProductRack } from '@/components/product/ProductRack';
import { ButtonLink } from '@/components/ui/Button';
import { Countdown } from '@/components/drops/Countdown';
import type { HomepageContent, LookbookContent } from '@/domain/cms';
import type { Product } from '@/domain/types';
import type { PublicCommunityPost } from '@/server/community';

/** Centred editorial heading used by every homepage section. */
export function CentredHeading({ id, eyebrow, title, lede }: { id: string; eyebrow?: string; title: string; lede?: string }) {
  return (
    <header className="mx-auto mb-10 max-w-2xl text-center md:mb-14">
      {eyebrow && <p className="text-fg-faint mb-4 text-[0.66rem] font-semibold tracking-[0.32em] uppercase">{eyebrow}</p>}
      <h2 id={id} className="font-display text-[clamp(2rem,6vw,3.6rem)] leading-[0.92] text-balance">
        {title}
      </h2>
      {lede && <p className="text-fg-muted mx-auto mt-5 max-w-lg text-[0.95rem] leading-relaxed">{lede}</p>}
    </header>
  );
}

export function StatementSection({ content }: { content: HomepageContent['statement'] }) {
  return (
    <Section surface="paper" spacing="loose" aria-labelledby="statement-heading">
      <div className="mx-auto max-w-3xl text-center">
        {content.eyebrow && <p className="text-fg-faint mb-6 text-[0.66rem] font-semibold tracking-[0.32em] uppercase">{content.eyebrow}</p>}
        <h2 id="statement-heading" className="font-display text-[clamp(2.1rem,6.5vw,4.4rem)] leading-[0.92] text-balance">
          {content.headline}
        </h2>
        {content.body && <p className="text-fg-muted mx-auto mt-7 max-w-xl text-base leading-relaxed">{content.body}</p>}
      </div>
    </Section>
  );
}

export function FeaturedSection({ title, products }: { title: string; products: readonly Product[] }) {
  if (products.length === 0) return null;
  return (
    <Section surface="paper" aria-labelledby="featured-heading" className="pt-0">
      <CentredHeading id="featured-heading" eyebrow="Now in store" title={title} />
      <ProductRack products={products} priorityCount={0} columns={4} />
      <div className="mt-10 flex justify-center">
        <ButtonLink href="/shop?sort=newest" variant="secondary" size="md">
          View all new pieces
        </ButtonLink>
      </div>
    </Section>
  );
}

export function VaultSection({ content, productCount }: { content: HomepageContent['vault']; productCount: number }) {
  return (
    <Section surface="void" spacing="loose" aria-labelledby="vault-heading">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-fg-faint mb-5 text-[0.66rem] font-semibold tracking-[0.32em] uppercase">{content.eyebrow}</p>
        <h2 id="vault-heading" className="font-display text-[clamp(2.6rem,9vw,6rem)] leading-[0.88]">
          {content.headline}
        </h2>
        <p className="text-fg-muted mx-auto mt-6 max-w-md text-sm leading-relaxed">{content.body}</p>
        {productCount > 0 && <p className="text-fg-faint mt-3 text-xs tracking-[0.16em] uppercase tabular-nums">{productCount} pieces</p>}
        <div className="mt-10 flex justify-center">
          <Link
            href="/shop"
            data-testid="vault-cta"
            className="font-display bg-paper text-ink hover:bg-signal hover:text-paper inline-flex h-14 items-center px-10 text-[0.85rem] transition-colors"
          >
            {content.ctaLabel}
          </Link>
        </div>
      </div>
    </Section>
  );
}

export function LookbookSection({ content }: { content: LookbookContent }) {
  if (content.images.length === 0) return null;
  return (
    <Section surface="paper" aria-labelledby="lookbook-heading">
      <CentredHeading id="lookbook-heading" eyebrow="Editorial" title={content.title} lede={content.intro} />
      <ul className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-3">
        {content.images.slice(0, 6).map((image, index) => {
          const href = image.productHandles[0] ? `/products/${image.productHandles[0]}` : '/lookbook';
          return (
            <li key={`${image.url}-${index}`}>
              <Link href={href} className="group block">
                <div className="bg-surface-sunken relative aspect-[4/5] overflow-hidden">
                  <Image
                    src={image.url}
                    alt={image.alt}
                    fill
                    sizes="(min-width: 768px) 33vw, 50vw"
                    className="object-cover object-top transition-transform duration-700 ease-(--ease-brand) group-hover:scale-[1.03]"
                  />
                </div>
                {image.caption && <p className="text-fg-muted mt-2 text-center text-xs">{image.caption}</p>}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="mt-10 flex justify-center">
        <ButtonLink href="/lookbook" variant="secondary" size="md">
          Full lookbook
        </ButtonLink>
      </div>
    </Section>
  );
}

export function CommunitySection({ posts }: { posts: readonly PublicCommunityPost[] }) {
  if (posts.length === 0) return null;
  return (
    <Section surface="paper" aria-labelledby="community-heading" className="pt-0">
      <CentredHeading
        id="community-heading"
        eyebrow="The Troop in INFNITY"
        title="Styled By You"
        lede="Wanna be added to the wall? Post and tag us @infnity.clo — or send your fit in."
      />
      <ul className="no-scrollbar -mx-(--spacing-gutter) flex snap-x snap-mandatory gap-2 overflow-x-auto px-(--spacing-gutter) md:mx-0 md:grid md:grid-cols-6 md:overflow-visible md:px-0">
        {posts.slice(0, 12).map((post) => (
          <li key={post.id} className="w-[42vw] shrink-0 snap-start md:w-auto">
            <Link href="/styled-by-you" className="bg-surface-sunken relative block aspect-[4/5] overflow-hidden">
              <Image src={post.imageUrl} alt={post.alt} fill sizes="(min-width: 768px) 16vw, 42vw" className="object-cover" />
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <ButtonLink href="/styled-by-you" variant="primary" size="md">
          See the wall
        </ButtonLink>
        <ButtonLink href="/styled-by-you#submit" variant="secondary" size="md">
          Submit your fit
        </ButtonLink>
      </div>
    </Section>
  );
}

export interface TeaserDrop {
  slug: string;
  name: string;
  status: string;
  headline: string | null;
  body: string | null;
  mediaUrl: string | null;
  mediaAlt: string | null;
  releaseAt: Date | null;
  releaseConfirmed: boolean;
  waitlistEnabled: boolean;
}

/** Renders only when the owner has put a drop in "coming soon" or "early access". */
export function ComingSoonSection({ drop }: { drop: TeaserDrop | null }) {
  if (!drop) return null;
  return (
    <Section surface="concrete" aria-labelledby="coming-soon-heading">
      <div className="mx-auto grid max-w-5xl items-center gap-10 md:grid-cols-2">
        {drop.mediaUrl && (
          <div className="bg-surface-sunken relative aspect-[4/5] overflow-hidden">
            <Image src={drop.mediaUrl} alt={drop.mediaAlt ?? drop.name} fill sizes="(min-width: 768px) 40vw, 100vw" className="object-cover" />
          </div>
        )}
        <div className={drop.mediaUrl ? 'text-center md:text-left' : 'text-center md:col-span-2'}>
          <p className="text-fg-faint mb-4 text-[0.66rem] font-semibold tracking-[0.32em] uppercase">
            {drop.status === 'early_access' ? 'Early access' : 'Coming soon'}
          </p>
          <h2 id="coming-soon-heading" className="font-display text-[clamp(2rem,6vw,3.6rem)] leading-[0.92]">
            {drop.headline || drop.name}
          </h2>
          {drop.body && <p className="text-fg-muted mt-5 text-sm leading-relaxed">{drop.body}</p>}
          {drop.releaseConfirmed && drop.releaseAt && <Countdown target={drop.releaseAt.toISOString()} className="mt-6" />}
          {drop.waitlistEnabled && (
            <div className={drop.mediaUrl ? 'mt-8 flex justify-center md:justify-start' : 'mt-8 flex justify-center'}>
              <WaitlistForm slug={drop.slug} />
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}

export function NewsletterSection({ content }: { content: HomepageContent['newsletter'] }) {
  return (
    <Section surface="paper" id="newsletter" aria-labelledby="newsletter-heading">
      <div className="mx-auto max-w-xl text-center">
        <p className="text-fg-faint mb-4 text-[0.66rem] font-semibold tracking-[0.32em] uppercase">Join the Troop</p>
        <h2 id="newsletter-heading" className="font-display text-[clamp(2rem,6vw,3.4rem)] leading-[0.92]">
          {content.headline}
        </h2>
        <p className="text-fg-muted mx-auto mt-5 max-w-md text-sm leading-relaxed">{content.body}</p>
        <NewsletterForm source="homepage" className="mx-auto mt-8 max-w-md" />
      </div>
    </Section>
  );
}
