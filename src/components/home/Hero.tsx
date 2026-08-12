import { MediaFrame } from '@/components/ui/MediaFrame';
import { cn } from '@/lib/cn';
import { ButtonLink } from '@/components/ui/Button';
import type { ProductMedia } from '@/domain/types';

/**
 * Homepage hero.
 *
 * 1.0 put white type over a black void and, with no campaign asset imported, the
 * first screen of the storefront was a black rectangle. 1.1 inverts it: the hero
 * is bone, the type is ink, and a single red rule marks the drop. Arriving on
 * light and dropping into the white product showroom is what makes the
 * hero → products transition read as walking through a door rather than
 * scrolling a page.
 *
 * Two compositions, chosen by whether campaign photography exists:
 *
 * - **With a photograph**: an asymmetric split. Type owns the left, the
 *   photograph runs off the right edge of the glass. On a phone the type leads
 *   and the photograph becomes a full-bleed band beneath it — never a scrim over
 *   the image, which is where legibility goes to die on a bright packshot.
 * - **Without one**: the type *is* the composition. Set at full statement scale
 *   with a red rule and the drop line, it reads as an intentional typographic
 *   landing page rather than as a photograph that failed to load.
 *
 * The second case is not hypothetical — it is what ships until the catalogue
 * import runs — so it is designed, not degraded.
 */
export function Hero({ media }: { media: ProductMedia | null }) {
  return (
    <section
      data-surface="bone"
      className="bg-surface text-fg relative overflow-hidden"
      aria-labelledby="hero-heading"
    >
      {/* The split only exists when there is a photograph to put in it. Holding
          a second column open for an image that never arrives is what produces
          the half-empty hero; without one, the statement takes the whole
          canvas, which is a stronger composition anyway. */}
      <div
        className={cn(
          'edge grid items-center gap-10 pt-16 pb-16 md:min-h-[82svh] md:gap-14 md:pt-10 md:pb-24',
          media && 'md:grid-cols-[1.05fr_0.95fr] md:pr-0',
        )}
      >
        <div className={media ? 'max-w-xl' : 'max-w-4xl'}>
          <div className="mb-7 flex items-center gap-4">
            <span aria-hidden className="bg-signal h-px w-12" />
            <p className="text-fg-faint text-[0.66rem] font-semibold tracking-[0.32em] uppercase">
              Infnity
            </p>
          </div>

          <h1
            id="hero-heading"
            className={cn(
              'font-display text-statement text-fg oblique text-balance',
              media ? 'max-w-[11ch]' : 'max-w-[9ch]',
            )}
          >
            Be the Statement
          </h1>

          {/* The brand's own description of itself, as published on
              infinityclo.ca. Not a rewrite of it. */}
          <p className="text-fg-muted mt-7 max-w-md text-[0.95rem] leading-relaxed">
            Where raw identity meets untouchable design — built for the ones who don&apos;t fold,
            don&apos;t follow, and never settle.
          </p>

          {/* Equal-width on a phone so the stacked pair reads as one block
              instead of a ragged edge; content-width side by side above that. */}
          <div className="mt-10 grid max-w-sm grid-cols-1 gap-3 sm:flex sm:max-w-none sm:flex-wrap">
            <ButtonLink href="/shop" variant="primary" size="lg">
              Shop all pieces
            </ButtonLink>
            <ButtonLink href="/shop?sort=newest" variant="secondary" size="lg">
              New arrivals
            </ButtonLink>
          </div>
        </div>

        {media ? (
          /* Runs off the right edge on desktop; a full-bleed band on mobile.
             `-mx` cancels the section gutter rather than nesting another
             container, so the image touches the glass exactly. */
          <div className="-mx-(--spacing-gutter) md:mx-0 md:h-full md:self-stretch">
            <div data-surface="paper" className="bg-surface h-full">
              <MediaFrame
                src={media.url}
                alt={media.alt}
                sizes="(min-width: 768px) 48vw, 100vw"
                priority
                fallbackLabel="INFNITY"
                ratioClassName="aspect-[4/5] md:aspect-auto md:h-full md:min-h-[70svh]"
              />
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
