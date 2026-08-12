'use client';

/**
 * The single way a photograph enters this storefront.
 *
 * Every product image, campaign shot and editorial frame goes through here, so
 * three things are guaranteed once rather than re-implemented per surface:
 *
 * 1. **The frame never collapses.** The aspect ratio is owned by the wrapper, so
 *    a portrait packshot and a landscape detail shot occupy identical space and
 *    the page cannot reflow as imagery arrives. No layout shift, ever.
 * 2. **Images fade in off a material plate**, not off a pulsing skeleton. A
 *    shimmer draws the eye to the loading state; a flat concrete plate resolving
 *    into a garment reads like a print appearing on paper.
 * 3. **A missing photograph is a designed state.** When there is no image, or
 *    the file 404s, the frame becomes a typographic plate carrying the product
 *    name — the garment tag, not a broken-image icon. This matters more than
 *    usual here: the catalogue import is the only source of real photography,
 *    and if it has not run, every frame on the site takes this path. It has to
 *    look intentional.
 *
 * `object-cover` is used everywhere except zoom. Fashion photography must not be
 * stretched, and `cover` on a fixed ratio is the only combination that
 * guarantees it across mixed source dimensions.
 */
import Image from 'next/image';
import { useState } from 'react';

import { cn } from '@/lib/cn';

interface MediaFrameProps {
  src: string | null | undefined;
  alt: string;
  /** Tailwind aspect utility, e.g. `aspect-(--aspect-portrait)`. */
  ratioClassName?: string;
  sizes: string;
  priority?: boolean;
  /** Text shown on the plate when there is no usable image. */
  fallbackLabel?: string;
  /** `contain` is for zoom views, where cropping the garment is unacceptable. */
  fit?: 'cover' | 'contain';
  className?: string;
  imageClassName?: string;
  children?: React.ReactNode;
}

export function MediaFrame({
  src,
  alt,
  ratioClassName = 'aspect-(--aspect-portrait)',
  sizes,
  priority = false,
  fallbackLabel,
  fit = 'cover',
  className,
  imageClassName,
  children,
}: MediaFrameProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);

  const showImage = Boolean(src) && !hasFailed;

  return (
    <div
      className={cn('media-plate relative overflow-hidden', ratioClassName, className)}
      data-loaded={showImage && isLoaded ? '' : undefined}
    >
      {showImage ? (
        <Image
          src={src as string}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          // Priority images are already fetched eagerly; marking the rest lazy
          // is what keeps a long catalogue from requesting forty photographs on
          // first paint.
          loading={priority ? undefined : 'lazy'}
          onLoad={() => setIsLoaded(true)}
          onError={() => setHasFailed(true)}
          className={cn(
            fit === 'cover' ? 'object-cover' : 'object-contain',
            'transition-opacity duration-700 ease-(--ease-brand)',
            isLoaded ? 'opacity-100' : 'opacity-0',
            imageClassName,
          )}
        />
      ) : (
        <MediaPlate label={fallbackLabel ?? alt} />
      )}
      {children}
    </div>
  );
}

/**
 * The no-photograph state.
 *
 * Set as a garment tag: rule, name, rule. It reads as a deliberate blank in a
 * lookbook rather than as a failure, which is the difference between a
 * storefront that looks unfinished and one that looks edited.
 *
 * The colours here are fixed rather than surface-relative, and that is the
 * point. A surface-relative plate resolved to concrete inside a concrete
 * section and vanished — the card lost its frame entirely and the layout read
 * as broken. A fixed material plus an inset rule means the frame is always
 * visible: against paper, against concrete, and against the black rooms, where
 * it becomes a lit panel on a gallery wall.
 */
function MediaPlate({ label }: { label: string }) {
  return (
    <div
      className="bg-concrete ring-concrete-deep absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center ring-1 ring-inset"
      aria-hidden
    >
      <span className="bg-graphite/45 h-px w-8" />
      <span className="font-display text-graphite text-[0.72rem] leading-tight tracking-[0.18em]">
        {label}
      </span>
      <span className="bg-graphite/45 h-px w-8" />
    </div>
  );
}
