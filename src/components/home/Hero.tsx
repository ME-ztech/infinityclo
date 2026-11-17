'use client';

/**
 * Campaign hero — a slideshow of the brand's own photography.
 *
 * Composition
 *   Mobile   one photograph, full-bleed and portrait, cropped around the slide's
 *            focal point so it reads as a composed frame rather than a chopped
 *            banner.
 *   Desktop  every photograph of the slide side by side, edge to edge.
 *
 * The hero is a column of two parts:
 *
 *   Crest  the gold emblem, centred in its own band directly under the
 *          wordmark in the header. It is in normal flow — never laid over a
 *          photograph — so no slide, crop or model's head can ever collide with
 *          it. The band is white like the studio backdrops of the photography,
 *          so the mark reads as standing above the model, not stamped on them.
 *   Stage  the photographs, filling the remaining height. Lower-left carries
 *          the slide titles as a stacked statement — the active one at full
 *          strength — and the call to action. The stacked titles double as the
 *          slide selector, so there is no separate row of anonymous dots.
 *
 * Behaviour
 *   - Auto-advances only when more than one slide exists, an interval is set,
 *     the visitor has not asked for reduced motion and has not pressed Pause.
 *   - A visible Pause/Play button, previous/next buttons and arrow keys.
 *   - Slides cross-fade in place: every slide is absolutely positioned inside a
 *     fixed-height stage, so changing slide cannot shift layout.
 *   - Only the first slide's first photograph is marked priority; the rest load
 *     lazily.
 *
 * Every word and image comes from the CMS (`content.hero`). With no enabled
 * slide the component renders a type-only statement instead of an empty frame.
 */
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ButtonLink } from '@/components/ui/Button';
import { Emblem } from '@/components/ui/Wordmark';
import { cn } from '@/lib/cn';
import type { HeroSlide } from '@/server/cms';

interface HeroProps {
  slides: readonly HeroSlide[];
  autoAdvanceSeconds: number;
}

const GRID = { 1: 'md:grid-cols-1', 2: 'md:grid-cols-2', 3: 'md:grid-cols-3' } as const;

/** The hero's emblem: about 1.4× the size it used to be stamped on the photo. */
const CREST = 'h-[clamp(4rem,17vw,4.5rem)] md:h-20';

export function Hero({ slides, autoAdvanceSeconds }: HeroProps) {
  const [active, setActive] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const regionRef = useRef<HTMLElement | null>(null);

  const count = slides.length;
  const go = useCallback((index: number) => setActive(((index % count) + count) % count), [count]);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  const canAutoAdvance = count > 1 && autoAdvanceSeconds > 0 && !reducedMotion;
  const isPlaying = canAutoAdvance && !isPaused;

  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setInterval(() => {
      // A hidden tab should not burn through the campaign unseen.
      if (document.visibilityState === 'visible') setActive((index) => (index + 1) % count);
    }, autoAdvanceSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [autoAdvanceSeconds, count, isPlaying]);

  if (count === 0) {
    return (
      <section
        data-testid="hero"
        aria-labelledby="hero-heading"
        className="edge flex min-h-[60svh] flex-col items-center justify-center py-24 text-center"
      >
        <Emblem className={cn('mb-8', CREST)} sizes="120px" priority />
        <h1 id="hero-heading" className="font-display text-statement text-fg">
          Be the Statement
        </h1>
        <ButtonLink href="/shop" size="lg" className="mt-10">
          Shop now
        </ButtonLink>
      </section>
    );
  }

  const current = slides[active] ?? slides[0]!;
  const isLight = current.tone === 'light';

  function onKeyDown(event: React.KeyboardEvent) {
    if (count < 2) return;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      go(active + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      go(active - 1);
    }
  }

  return (
    <section
      ref={regionRef}
      data-testid="hero"
      aria-roledescription="carousel"
      aria-label="INFNITY campaign"
      onKeyDown={onKeyDown}
      className="bg-surface relative flex h-[calc(100svh-4rem)] max-h-[58rem] min-h-[34rem] w-full flex-col overflow-hidden md:h-[calc(100svh-4.5rem)]"
    >
      <h1 className="sr-only">INFNITY — Be the Statement</h1>

      {/* ── Crest ───────────────────────────────────────────────────── */}
      <div
        data-testid="hero-crest"
        className="short-phone:pt-4 short-phone:pb-3 flex shrink-0 justify-center pt-5 pb-4 md:pt-7 md:pb-6"
      >
        <Emblem className={CREST} sizes="120px" priority />
      </div>

      {/* ── Stage ───────────────────────────────────────────────────── */}
      <div data-testid="hero-stage" className="bg-surface-sunken relative min-h-0 flex-1">
        {/* ── Slides ──────────────────────────────────────────────────── */}
        {slides.map((slide, index) => {
          const isActive = index === active;
          const columns = Math.min(slide.images.length, 3) as 1 | 2 | 3;
          return (
            <div
              key={slide.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${count}: ${slide.title}`}
              aria-hidden={!isActive}
              data-testid="hero-slide"
              data-active={isActive}
              className={cn(
                'absolute inset-0 grid grid-cols-1 transition-opacity duration-700 ease-(--ease-brand)',
                GRID[columns],
                isActive ? 'opacity-100' : 'pointer-events-none opacity-0',
              )}
            >
              {slide.images.map((image, imageIndex) => (
                <div
                  key={image.url}
                  className={cn('relative h-full w-full', imageIndex > 0 && 'hidden md:block')}
                >
                  <Image
                    src={image.url}
                    alt={isActive ? image.alt : ''}
                    fill
                    priority={index === 0 && imageIndex === 0}
                    loading={index === 0 && imageIndex === 0 ? undefined : 'lazy'}
                    sizes={
                      columns === 1
                        ? '100vw'
                        : `(min-width: 768px) ${Math.ceil(100 / columns)}vw, 100vw`
                    }
                    className="object-cover"
                    style={{ objectPosition: `${slide.focalPoint.x}% ${slide.focalPoint.y}%` }}
                  />
                </div>
              ))}

              {slide.overlay > 0 && (
                <div
                  aria-hidden
                  className="absolute inset-0 bg-black"
                  style={{ opacity: slide.overlay / 100 }}
                />
              )}
            </div>
          );
        })}

        {/* A wash behind the copy only, so type stays legible without dimming the
          photograph: a band along the bottom on a phone, a soft corner on wider
          screens. It follows the slide's tone. */}
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-0 hidden h-[75%] w-[62%] md:block"
          style={{ backgroundImage: wash(isLight) }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[52%] md:hidden"
          style={{
            backgroundImage: `linear-gradient(to top, ${isLight ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.92)'} 0%, ${isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.6)'} 55%, transparent 100%)`,
          }}
        />

        {/* ── Copy, lower left ────────────────────────────────────────── */}
        <div
          className={cn(
            'edge short-phone:gap-4 short-phone:pb-5 absolute inset-x-0 bottom-0 flex flex-col gap-6 pb-7 md:flex-row md:items-end md:justify-between md:pb-12',
            isLight ? 'text-paper' : 'text-ink',
          )}
        >
          <div className="min-w-0">
            {current.eyebrow && (
              <p
                className={cn(
                  'short-phone:mb-2 mb-3 text-[0.66rem] font-semibold tracking-[0.3em] uppercase',
                  isLight ? 'text-paper/80' : 'text-ink/70',
                )}
              >
                {current.eyebrow}
              </p>
            )}

            <ul className="flex flex-col items-start gap-1" aria-label="Slides">
              {slides.map((slide, index) => {
                const isActive = index === active;
                return (
                  <li key={slide.id}>
                    <button
                      type="button"
                      onClick={() => go(index)}
                      aria-current={isActive ? 'true' : undefined}
                      aria-label={`Show slide ${index + 1}: ${slide.title}`}
                      data-testid="hero-dot"
                      className={cn(
                        'font-display block min-h-11 text-left text-[clamp(1.9rem,7.4vw,3.6rem)] leading-[1.02] transition-opacity duration-300',
                        isActive ? 'opacity-100' : 'opacity-35 hover:opacity-70',
                      )}
                    >
                      {slide.title}
                    </button>
                  </li>
                );
              })}
            </ul>

            {current.ctaLabel && (
              <ButtonLink
                href={current.ctaHref}
                size="lg"
                data-testid="hero-cta"
                className={cn(
                  'short-phone:mt-4 mt-6',
                  isLight
                    ? 'bg-paper text-ink hover:opacity-85'
                    : 'bg-ink text-paper hover:opacity-85',
                )}
              >
                {current.ctaLabel}
              </ButtonLink>
            )}
          </div>

          {/* ── Controls, lower right ─────────────────────────────────── */}
          {count > 1 && (
            <div className="flex items-center gap-2 self-end">
              <button
                type="button"
                onClick={() => go(active - 1)}
                aria-label="Previous slide"
                data-testid="hero-prev"
                className={controlClass(isLight, 'w-11')}
              >
                <span aria-hidden>←</span>
              </button>
              <button
                type="button"
                onClick={() => go(active + 1)}
                aria-label="Next slide"
                data-testid="hero-next"
                className={controlClass(isLight, 'w-11')}
              >
                <span aria-hidden>→</span>
              </button>
              {canAutoAdvance && (
                <button
                  type="button"
                  onClick={() => setIsPaused((value) => !value)}
                  aria-label={isPaused ? 'Play slideshow' : 'Pause slideshow'}
                  aria-pressed={isPaused}
                  data-testid="hero-pause"
                  className={controlClass(isLight, 'px-5')}
                >
                  {isPaused ? 'Play' : 'Pause'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Announce slide changes only when the visitor is driving. */}
      <p className="sr-only" aria-live={isPlaying ? 'off' : 'polite'}>
        Slide {active + 1} of {count}: {current.title}
      </p>
    </section>
  );
}

/** Desktop corner wash: strongest at the lower-left, gone by mid-frame. */
function wash(isLight: boolean): string {
  const c = isLight ? '0,0,0' : '255,255,255';
  const peak = isLight ? 0.7 : 0.94;
  return `radial-gradient(ellipse at bottom left, rgba(${c},${peak}) 0%, rgba(${c},${peak * 0.8}) 38%, rgba(${c},0) 72%)`;
}

function controlClass(isLight: boolean, sizing: string): string {
  return cn(
    'grid h-11 place-items-center rounded-full border text-[0.7rem] font-semibold tracking-[0.18em] uppercase transition-colors',
    sizing,
    isLight
      ? 'border-paper/70 bg-ink/40 text-paper hover:bg-paper hover:text-ink'
      : 'border-ink/60 bg-paper/85 text-ink hover:bg-ink hover:text-paper',
  );
}
