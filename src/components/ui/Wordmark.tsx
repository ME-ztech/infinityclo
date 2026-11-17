import Image from 'next/image';

import { cn } from '@/lib/cn';
import { BRAND } from '@/lib/site';

/**
 * The INFNITY brand marks.
 *
 * `Emblem` is the brand's own emblem — the artwork published as the logo on
 * infinityclo.ca — cropped to its bounds by `scripts/build-brand-marks.mjs`.
 * The gold original is the default; the ink and paper variants are the same
 * shape in a flat colour for monochrome contexts and dark photography.
 *
 * `Wordmark` sets the brand name in type beside it. The name is typeset rather
 * than drawn because no vector wordmark has been supplied (see
 * docs/assets-and-rights.md); it is the brand's name, not an invented logo.
 */
const EMBLEM = {
  gold: '/brand/emblem.png',
  ink: '/brand/emblem-ink.png',
  paper: '/brand/emblem-paper.png',
} as const;

export function Emblem({
  tone = 'gold',
  className,
  priority,
  sizes = '128px',
}: {
  tone?: keyof typeof EMBLEM;
  className?: string;
  priority?: boolean;
  /** The widest the mark is ever drawn, so a large mark is not upscaled. */
  sizes?: string;
}) {
  return (
    <Image
      src={EMBLEM[tone]}
      alt=""
      aria-hidden
      width={480}
      height={320}
      priority={priority}
      sizes={sizes}
      className={cn('h-8 w-auto select-none', className)}
    />
  );
}

export function Wordmark({
  className,
  withEmblem = false,
  emblemClassName,
}: {
  className?: string;
  withEmblem?: boolean;
  emblemClassName?: string;
}) {
  return (
    <span className="inline-flex items-center gap-2.5">
      {withEmblem && <Emblem className={emblemClassName} priority />}
      <span
        className={cn(
          'font-display text-fg leading-none tracking-[0.14em] uppercase select-none',
          className,
        )}
      >
        {BRAND.name}
      </span>
    </span>
  );
}
