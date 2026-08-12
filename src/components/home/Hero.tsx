import Image from 'next/image';

import { ButtonLink } from '@/components/ui/Button';
import type { ProductMedia } from '@/domain/types';

/**
 * Homepage hero.
 *
 * Built to carry the campaign statement typographically, so it holds up as a
 * designed surface whether or not a campaign photograph is available. When one
 * is, it goes full-bleed behind the type with a gradient scrim that guarantees
 * contrast; when none is, the type *is* the composition rather than sitting on
 * an apologetic grey box.
 *
 * The statement is set in a fluid clamp so "BE THE STATEMENT" fills the viewport
 * edge-to-edge at 360px and at 1920px without a breakpoint jump.
 */
export function Hero({ media }: { media: ProductMedia | null }) {
  return (
    <section
      className="relative flex min-h-[88svh] items-end overflow-hidden"
      aria-labelledby="hero-heading"
    >
      {media ? (
        <>
          <Image
            src={media.url}
            alt={media.alt}
            fill
            priority
            sizes="100vw"
            className="object-cover object-center"
          />
          {/* Two-stop scrim: heavier at the base where the type and CTA sit. */}
          <div
            aria-hidden
            className="from-void via-void/45 absolute inset-0 bg-gradient-to-t to-transparent"
          />
        </>
      ) : (
        <div aria-hidden className="absolute inset-0">
          {/* No campaign asset yet. Rather than a stock photograph or a
              decorative gradient, the surface stays flat and lets the wordmark
              carry it. Replaced by the real campaign shot at import. */}
          <div className="bg-void absolute inset-0" />
          <div className="border-ash/30 absolute inset-x-[--spacing-gutter] inset-y-16 border" />
        </div>
      )}

      <div className="edge relative w-full pb-16 md:pb-24">
        <p className="text-smoke mb-5 text-[0.7rem] font-semibold tracking-[0.3em] uppercase">
          Infnity
        </p>

        <h1
          id="hero-heading"
          className="font-display text-statement text-paper max-w-[16ch] text-balance"
        >
          Be the Statement
        </h1>

        <p className="text-bone/85 mt-6 max-w-md text-sm leading-relaxed md:text-base">
          Raw identity, heavyweight construction. For the ones who don&apos;t fold and don&apos;t
          follow.
        </p>

        <div className="mt-9 flex flex-wrap gap-3">
          <ButtonLink href="/shop" variant="primary" size="lg">
            Shop all
          </ButtonLink>
          <ButtonLink href="/vault" variant="secondary" size="lg">
            Enter the Vault
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
