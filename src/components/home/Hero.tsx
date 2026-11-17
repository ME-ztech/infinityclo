'use client';

/**
 * Campaign hero — a slideshow composed from the owner's own photography.
 *
 * Composition follows the areas the owner circled on the reference screenshot:
 * the brand mark top-centre (the header sits translucent over the hero on the
 * homepage), and a stacked list of statements bottom-left with the active one
 * lit — "Be the Statement" above it, as the notes ask — then the call to
 * action. A pause control sits bottom-right.
 *
 * - Wide screens show the slide's lineup (up to three studio shots side by
 *   side); phones show one purpose-chosen shot cropped on its focal point.
 * - Only the first slide's image is requested up front (and preloaded); the
 *   rest load once the page is idle.
 * - Autoplay stops for reduced-motion users, on hover/focus, and whenever the
 *   pause control is used. Every slide is reachable with the keyboard.
 */
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { HeroContent, HeroSlide } from '@/domain/cms';
import { cn } from '@/lib/cn';

export function Hero({ content }: { content: HeroContent }) {
  const slides = content.slides;
  const [active, setActive] = useState(0);
  const [isPaused, setIsPaused] = useState(!content.autoplay);
  const [isInteracting, setIsInteracting] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [loadRest, setLoadRest] = useState(false);
  const regionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setLoadRest(true), 1200);
    return () => window.clearTimeout(timer);
  }, []);

  const isPlaying = slides.length > 1 && !isPaused && !reducedMotion && !isInteracting;

  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setInterval(() => setActive((index) => (index + 1) % slides.length), content.intervalSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [isPlaying, slides.length, content.intervalSeconds]);

  const goTo = useCallback((index: number) => {
    setLoadRest(true);
    setActive(index);
  }, []);

  const current = slides[active] ?? slides[0]!;
  const tone = current.tone;

  return (
    <section
      ref={regionRef}
      aria-roledescription="carousel"
      aria-label="INFNITY campaign"
      data-testid="hero"
      onMouseEnter={() => setIsInteracting(true)}
      onMouseLeave={() => setIsInteracting(false)}
      onFocusCapture={() => setIsInteracting(true)}
      onBlurCapture={(event) => {
        if (!regionRef.current?.contains(event.relatedTarget as Node | null)) setIsInteracting(false);
      }}
      className="relative -mt-16 h-[max(36rem,calc(100svh-2rem))] w-full overflow-hidden bg-white md:-mt-[4.75rem] md:h-[min(92vh,60rem)]"
    >
      {slides.map((slide, index) => (
        <SlideMedia key={slide.id} slide={slide} index={index} count={slides.length} isActive={index === active} load={index === 0 || loadRest} />
      ))}

      {/* Legibility wash behind the copy, toned to the photograph. */}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-0 h-[46%] transition-colors duration-700 md:h-[60%]',
          tone === 'light'
            ? 'bg-gradient-to-t from-white via-white/70 to-transparent md:from-white/95 md:via-white/40'
            : 'bg-gradient-to-t from-black/85 via-black/45 to-transparent',
        )}
      />
      {current.overlay > 0 && (
        <div aria-hidden className={cn('pointer-events-none absolute inset-0', tone === 'light' ? 'bg-white' : 'bg-black')} style={{ opacity: current.overlay / 100 }} />
      )}

      <div
        className={cn(
          'edge absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 pb-6 md:gap-6 md:pb-12',
          tone === 'light' ? 'text-ink' : 'text-paper',
        )}
      >
        <div className="max-w-xl">
          <h1 className="font-display text-[clamp(1.9rem,8vw,5.6rem)] leading-[0.88]" data-testid="hero-slogan">
            {content.slogan}
          </h1>

          {/* The stacked statements: each one is a slide; the lit one is current. */}
          <ul className="mt-3 flex flex-col md:mt-5 md:gap-0.5" aria-label="Choose a slide">
            {slides.map((slide, index) => (
              <li key={slide.id}>
                <button
                  type="button"
                  onClick={() => goTo(index)}
                  aria-current={index === active ? 'true' : undefined}
                  aria-label={`Slide ${index + 1} of ${slides.length}: ${slide.label}`}
                  className={cn(
                    'font-display min-h-7 text-left text-[0.92rem] leading-tight transition-opacity duration-300 md:min-h-8 md:text-[1.45rem]',
                    index === active ? 'opacity-100' : 'opacity-35 hover:opacity-70',
                  )}
                >
                  {slide.label}
                </button>
              </li>
            ))}
          </ul>

          <p className="mt-4 hidden max-w-sm text-sm leading-snug font-medium opacity-80 md:block" aria-live={isPlaying ? 'off' : 'polite'}>
            {current.headline}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 md:mt-6 md:gap-x-6 md:gap-y-3">
            <Link
              href={current.ctaHref}
              data-testid="hero-cta"
              className={cn(
                'font-display inline-flex h-12 min-w-36 items-center justify-center px-7 text-[0.8rem] transition-colors md:h-13 md:min-w-40 md:px-8',
                tone === 'light' ? 'bg-ink text-paper hover:bg-signal' : 'bg-paper text-ink hover:bg-signal hover:text-paper',
              )}
            >
              {current.ctaLabel}
            </Link>
            <Link
              href={content.secondaryCtaHref}
              className="font-display inline-flex min-h-11 items-center text-[0.82rem] underline-offset-4 hover:underline"
            >
              {content.secondaryCtaLabel} →
            </Link>
          </div>
        </div>

        {slides.length > 1 && (
          <button
            type="button"
            onClick={() => setIsPaused((paused) => !paused)}
            aria-pressed={isPaused}
            aria-label={isPaused ? 'Play slideshow' : 'Pause slideshow'}
            data-testid="hero-pause"
            className={cn(
              'font-display flex h-11 min-w-20 shrink-0 items-center justify-center rounded-full border px-4 text-[0.7rem] transition-colors md:h-12 md:min-w-24 md:px-5',
              tone === 'light' ? 'border-ink/70 hover:bg-ink hover:text-paper' : 'border-paper/70 hover:bg-paper hover:text-ink',
            )}
          >
            {isPaused || reducedMotion ? 'Play' : 'Pause'}
          </button>
        )}
      </div>
    </section>
  );
}

function SlideMedia({ slide, index, count, isActive, load }: { slide: HeroSlide; index: number; count: number; isActive: boolean; load: boolean }) {
  const phone = slide.mobileImage ?? slide.images[0]!;
  const priority = index === 0;
  return (
    <div
      role="group"
      aria-roledescription="slide"
      aria-label={`${index + 1} of ${count}: ${slide.label}`}
      aria-hidden={!isActive}
      inert={!isActive}
      className={cn('absolute inset-0 transition-opacity duration-700 ease-out', isActive ? 'opacity-100' : 'opacity-0')}
    >
      {load && slide.mobileImage && (
        <div className="absolute inset-0 md:hidden">
          <Image
            src={phone.url}
            alt={phone.alt}
            fill
            priority={priority}
            sizes="100vw"
            className="object-cover"
            style={{ objectPosition: `${phone.focalX}% ${phone.focalY}%` }}
          />
        </div>
      )}
      {load && (
        /* One grid for both: on a phone only the first shot shows, full-bleed and
           cropped on its focal point; on wide screens the full lineup. Rendering
           the shared first image once means a single preload. */
        <div
          className={cn(
            'absolute inset-0 grid grid-cols-1',
            slide.mobileImage && 'hidden md:grid',
            slide.images.length === 2 ? 'md:grid-cols-2' : slide.images.length >= 3 ? 'md:grid-cols-3' : 'md:grid-cols-1',
          )}
        >
          {slide.images.map((image, imageIndex) => (
            <div key={image.url} className={cn('relative h-full', imageIndex > 0 && 'hidden md:block')}>
              <Image
                src={image.url}
                alt={image.alt}
                fill
                priority={priority && imageIndex === 0 && !slide.mobileImage}
                sizes={imageIndex === 0 ? `(min-width: 768px) ${Math.round(100 / slide.images.length)}vw, 100vw` : `${Math.round(100 / slide.images.length)}vw`}
                className="object-cover"
                style={{ objectPosition: `${image.focalX}% ${image.focalY}%` }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
