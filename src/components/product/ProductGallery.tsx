'use client';

/**
 * Product gallery.
 *
 * One component, two behaviours by viewport:
 * - Mobile: a native scroll-snap carousel. Swiping is the platform gesture and
 *   costs no JavaScript; a counter reports position via an IntersectionObserver
 *   rather than scroll maths.
 * - Desktop: a thumbnail rail plus a main frame, with arrow-key navigation and
 *   a fullscreen zoom view.
 *
 * Mixed aspect ratios are handled by fixing the frame ratio and letting images
 * cover it, so a portrait packshot and a landscape detail shot do not make the
 * page jump as the customer moves between them.
 */
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { ProductMedia } from '@/domain/types';
import { cn } from '@/lib/cn';
import { useFocusTrap } from '@/lib/useFocusTrap';

interface ProductGalleryProps {
  media: readonly ProductMedia[];
  productName: string;
  /** Index to jump to when a variant with its own image is selected. */
  activeMediaId?: string | null;
}

export function ProductGallery({ media, productName, activeMediaId }: ProductGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [syncedMediaId, setSyncedMediaId] = useState<string | null>(null);
  const [isZoomOpen, setIsZoomOpen] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  /**
   * Selecting a colour swaps the gallery to that variant's shot. This adjusts
   * state during render — React's documented pattern for deriving state from a
   * changed prop — rather than in an effect, which would paint the old image
   * for a frame first.
   */
  if (activeMediaId && activeMediaId !== syncedMediaId) {
    setSyncedMediaId(activeMediaId);
    const index = media.findIndex((item) => item.id === activeMediaId);
    if (index >= 0 && index !== activeIndex) setActiveIndex(index);
  }

  /**
   * Bring the mobile rail to the synced shot. Keyed on `syncedMediaId` so it
   * fires once per variant change and never fights a customer's own swipe,
   * which moves `activeIndex` without touching this.
   */
  useEffect(() => {
    if (!syncedMediaId) return;
    const index = media.findIndex((item) => item.id === syncedMediaId);
    if (index < 0) return;
    scrollerRef.current?.children[index]?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'start',
    });
  }, [syncedMediaId, media]);

  // Mobile position tracking. An observer is more reliable than scroll offsets
  // once momentum scrolling and rubber-banding are in play.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const index = Number((entry.target as HTMLElement).dataset.index);
            if (!Number.isNaN(index)) setActiveIndex(index);
          }
        }
      },
      { root: scroller, threshold: 0.6 },
    );

    for (const child of Array.from(scroller.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [media.length]);

  const go = useCallback(
    (delta: number) => {
      setActiveIndex((current) => {
        const next = (current + delta + media.length) % media.length;
        return next;
      });
    },
    [media.length],
  );

  if (media.length === 0) {
    return (
      <div className="bg-carbon text-dim flex aspect-[--aspect-portrait] items-center justify-center">
        <span className="font-display text-sm tracking-[0.14em]">{productName}</span>
      </div>
    );
  }

  const active = media[activeIndex] ?? media[0]!;

  return (
    <>
      {/* Mobile: swipeable rail */}
      <div className="relative md:hidden">
        <div
          ref={scrollerRef}
          className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto"
          role="group"
          aria-label={`${productName} images`}
        >
          {media.map((item, index) => (
            <div
              key={item.id}
              data-index={index}
              className="aspect-[--aspect-portrait] w-full shrink-0 snap-start"
            >
              <div className="bg-carbon relative h-full w-full">
                <Image
                  src={item.url}
                  alt={item.alt}
                  fill
                  sizes="100vw"
                  priority={index === 0}
                  className="object-cover"
                />
              </div>
            </div>
          ))}
        </div>

        {media.length > 1 && (
          <div className="bg-void/70 text-paper absolute right-3 bottom-3 px-2.5 py-1 text-[0.68rem] tabular-nums backdrop-blur-sm">
            {activeIndex + 1} / {media.length}
          </div>
        )}
      </div>

      {/* Desktop: thumbnails + frame */}
      <div className="hidden gap-4 md:flex">
        {media.length > 1 && (
          <div
            className="no-scrollbar flex max-h-[70svh] shrink-0 flex-col gap-3 overflow-y-auto"
            role="group"
            aria-label="Choose image"
          >
            {media.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveIndex(index)}
                aria-label={`View image ${index + 1} of ${media.length}`}
                aria-current={index === activeIndex}
                className={cn(
                  'bg-carbon relative h-24 w-[72px] shrink-0 overflow-hidden border transition-colors',
                  index === activeIndex ? 'border-paper' : 'hover:border-ash border-transparent',
                )}
              >
                <Image src={item.url} alt="" fill sizes="72px" className="object-cover" />
              </button>
            ))}
          </div>
        )}

        <div
          className="bg-carbon relative aspect-[--aspect-portrait] flex-1"
          tabIndex={0}
          role="group"
          aria-label={`${productName} image ${activeIndex + 1} of ${media.length}`}
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight') {
              event.preventDefault();
              go(1);
            } else if (event.key === 'ArrowLeft') {
              event.preventDefault();
              go(-1);
            } else if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setIsZoomOpen(true);
            }
          }}
        >
          <Image
            src={active.url}
            alt={active.alt}
            fill
            sizes="(min-width: 1280px) 45vw, 55vw"
            priority
            className="object-cover"
          />

          <button
            type="button"
            onClick={() => setIsZoomOpen(true)}
            aria-label="Open fullscreen view"
            className="bg-void/70 text-paper hover:bg-void absolute right-3 bottom-3 p-2.5 backdrop-blur-sm transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M6 1H1v5M10 15h5v-5M15 6V1h-5M1 10v5h5"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
          </button>
        </div>
      </div>

      {isZoomOpen && (
        <GalleryZoom
          media={media}
          index={activeIndex}
          productName={productName}
          onIndexChange={setActiveIndex}
          onClose={() => setIsZoomOpen(false)}
        />
      )}
    </>
  );
}

function GalleryZoom({
  media,
  index,
  productName,
  onIndexChange,
  onClose,
}: {
  media: readonly ProductMedia[];
  index: number;
  productName: string;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const containerRef = useFocusTrap(true, onClose);
  const current = media[index] ?? media[0]!;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'ArrowRight') onIndexChange((index + 1) % media.length);
      if (event.key === 'ArrowLeft') onIndexChange((index - 1 + media.length) % media.length);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [index, media.length, onIndexChange]);

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${productName} fullscreen gallery`}
      tabIndex={-1}
      className="bg-void fixed inset-0 z-[95] flex flex-col"
    >
      <div className="flex h-14 shrink-0 items-center justify-between px-5">
        <span className="text-smoke text-xs tabular-nums">
          {index + 1} / {media.length}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close fullscreen view"
          className="text-bone hover:text-paper -mr-2 p-3"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path d="m4 4 12 12M16 4 4 16" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </div>

      <div className="relative flex-1">
        <Image src={current.url} alt={current.alt} fill sizes="100vw" className="object-contain" />
      </div>

      {media.length > 1 && (
        <div className="flex h-20 shrink-0 items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => onIndexChange((index - 1 + media.length) % media.length)}
            aria-label="Previous image"
            className="text-bone hover:text-paper p-3"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => onIndexChange((index + 1) % media.length)}
            aria-label="Next image"
            className="text-bone hover:text-paper p-3"
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}
