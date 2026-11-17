import type { Metadata } from 'next';
import Image from 'next/image';

import { ButtonLink } from '@/components/ui/Button';
import { BrandMark } from '@/components/ui/Wordmark';

export const metadata: Metadata = {
  title: 'Our story',
  description:
    'Infnity.clo is where raw identity meets untouchable design. Built for the ones who don’t fold, don’t follow — and never settle.',
  alternates: { canonical: '/about' },
};

/**
 * Brand story — only words INFNITY has published itself (site description,
 * slogan, community wall, Instagram bio). The founder story, origin and
 * process are for the owner to supply; nothing is invented to fill them.
 */
export default function AboutPage() {
  return (
    <div className="pb-(--spacing-section)">
      <section className="edge mx-auto max-w-3xl pt-16 text-center md:pt-24">
        <BrandMark className="h-16 md:h-20" />
        <h1 className="font-display mt-8 text-[clamp(2.6rem,9vw,6rem)] leading-[0.88]">
          Be the Statement
        </h1>
        <p className="text-fg mt-8 text-lg leading-relaxed md:text-xl">
          Infnity.clo is where raw identity meets untouchable design. Built for the ones who don’t
          fold, don’t follow — and never settle.
        </p>
        <p className="font-display mt-6 text-xl">For the FLY only.</p>
        <p className="text-fg-muted mt-2">Question is… you got what it takes to be one?</p>
      </section>

      <section className="edge mx-auto mt-20 grid max-w-5xl items-center gap-10 md:grid-cols-2">
        <div className="bg-surface-sunken relative aspect-[4/5] overflow-hidden">
          <Image
            src="https://cdn.shopify.com/s/files/1/0605/7069/7948/files/fiji-2.jpg"
            alt="Model wearing INFNITY's Reversible Obsidian Blank Hoodie"
            fill
            sizes="(min-width: 768px) 40vw, 100vw"
            className="object-cover"
          />
        </div>
        <div className="text-center md:text-left">
          <p className="text-fg-faint text-[0.66rem] font-semibold tracking-[0.32em] uppercase">
            The Troop in INFNITY
          </p>
          <h2 className="font-display mt-4 text-[clamp(2rem,5vw,3rem)] leading-[0.92]">
            A community label, based in Canada
          </h2>
          <p className="text-fg-muted mt-5 text-sm leading-relaxed">
            The wall belongs to the people who wear it. Wanna be added? Post and tag us @infnity.clo
            — or send your fit in.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3 md:justify-start">
            <ButtonLink href="/styled-by-you" variant="primary" size="md">
              Styled By You
            </ButtonLink>
            <ButtonLink href="/shop" variant="secondary" size="md">
              Enter the Vault
            </ButtonLink>
          </div>
        </div>
      </section>
    </div>
  );
}
