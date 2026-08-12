'use client';

/**
 * Product gallery.
 *
 * One component, two genuinely different compositions:
 *
 * - **Mobile** — a full-bleed scroll-snap carousel with the brand's own
 *   `← ● ○ ○ ○ →` pagination beneath it. Swiping is the platform gesture and
 *   costs no JavaScript; the arrows exist because the legacy product page had
 *   them and because a customer who does not realise the image is swipeable
 *   still needs a way through. Position is reported by an IntersectionObserver
 *   rather than scroll arithmetic, which momentum scrolling and rubber-banding
 *   would otherwise get wrong.
 * - **Desktop** — every shot stacked and scrolled vertically, with the buy panel
 *   sticky alongside. Thumbnails are a workaround for a single fixed frame; if
 *   there is room to simply show the photographs, showing them is better.
 *
 * The frame ratio is fixed and images cover it, so a portrait packshot and a
 * landscape detail shot occupy identical space and the page never jumps as the
 * customer moves between them.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { MediaFrame } from '@/components/ui/MediaFrame';
import type { ProductMedia } from '@/domain/types';
import { cn } from '@/lib/cn';
import { RACK, RACK_ITEM } from '@/lib/rack';
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
  const [zoomIndex, setZoomIndex] = useState<number | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  /**
   * Selecting a colour swaps the gallery to that variant's shot. This adjusts
   * state during render — React's documented pattern for deriving state from a
   * changed prop — rather than in an effect, which would paint the old image for
   * a frame first.
   */
  if (activeMediaId && activeMediaId !== syncedMediaId) {
    setSyncedMediaId(activeMediaId);
    const index = media.findIndex((item) => item.id === activeMediaId);
    if (index >= 0 && index !== activeIndex) setActiveIndex(index);
  }

  const scrollToIndex = useCallback((index: number) => {
    scrollerRef.current?.children[index]?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'start',
    });
  }, []);

  /**
   * Bring the mobile rail to the synced shot. Keyed on `syncedMediaId` so it
   * fires once per variant change and never fights a customer's own swipe, which
   * moves `activeIndex` without touching this.
   */
  useEffect(() => {
    if (!syncedMediaId) return;
    const index = media.findIndex((item) => item.id === syncedMediaId);
    if (index >= 0) scrollToIndex(index);
  }, [syncedMediaId, media, scrollToIndex]);

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
      const next = (activeIndex + delta + media.length) % media.length;
      setActiveIndex(next);
      scrollToIndex(next);
    },
    [activeIndex, media.length, scrollToIndex],
  );

  if (media.length === 0) {
    return (
      <div data-surface="paper" className="bg-surface -mx-(--spacing-gutter) md:mx-0">
        <MediaFrame
          src={null}
          alt={productName}
          sizes="(min-width: 768px) 55vw, 100vw"
          fallbackLabel={productName}
          ratioClassName="aspect-(--aspect-portrait)"
        />
      </div>
    );
  }

  return (
    <>
      {/* ── Mobile: full-bleed swipe rail ─────────────────────────── */}
      <div className="md:hidden">
        <div
          ref={scrollerRef}
          data-surface="paper"
          className={cn(RACK, 'bg-surface -mx-(--spacing-gutter)')}
          role="group"
          aria-label={`${productName} images`}
          data-testid="gallery-rail"
        >
          {media.map((item, index) => (
            <div key={item.id} data-index={index} className={cn(RACK_ITEM, 'w-screen')}>
              <button
                type="button"
                onClick={() => setZoomIndex(index)}
                aria-label={`Open image ${index + 1} of ${media.length} fullscreen`}
                className="block w-full"
              >
                <MediaFrame
                  src={item.url}
                  alt={item.alt}
                  sizes="100vw"
                  priority={index === 0}
                  fallbackLabel={productName}
                  ratioClassName="aspect-(--aspect-portrait)"
                />
              </button>
            </div>
          ))}
        </div>

        {media.length > 1 && (
          /* The legacy product page's own pagination: arrows flanking a dot
             row. Kept because it is recognisable brand furniture, rebuilt with
             44px targets so it is usable with a thumb. */
          <div className="mt-5 flex items-center justify-center gap-5">
            <PagerArrow direction="prev" onClick={() => go(-1)} />
            <div className="flex items-center gap-2.5">
              {media.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveIndex(index);
                    scrollToIndex(index);
                  }}
                  aria-label={`Go to image ${index + 1}`}
                  aria-current={index === activeIndex}
                  className="grid h-11 w-5 place-items-center"
                >
                  <span
                    className={cn(
                      'block h-2 w-2 rounded-full transition-colors duration-200',
                      index === activeIndex ? 'bg-fg' : 'border-fg-faint border',
                    )}
                  />
                </button>
              ))}
            </div>
            <PagerArrow direction="next" onClick={() => go(1)} />
          </div>
        )}
      </div>

      {/* ── Desktop: every shot, stacked ──────────────────────────── */}
      <div data-surface="paper" className="hidden flex-col gap-3 md:flex">
        {media.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setZoomIndex(index)}
            aria-label={`Open ${productName} image ${index + 1} of ${media.length} fullscreen`}
            className="group bg-surface relative block w-full cursor-zoom-in"
          >
            <MediaFrame
              src={item.url}
              alt={item.alt}
              sizes="(min-width: 1280px) 46vw, 55vw"
              priority={index === 0}
              fallbackLabel={productName}
              ratioClassName="aspect-(--aspect-portrait)"
              imageClassName="transition-transform duration-[900ms] ease-(--ease-brand) group-hover:scale-[1.02]"
            />
          </button>
        ))}
      </div>

      {zoomIndex !== null && (
        <GalleryZoom
          media={media}
          index={zoomIndex}
          productName={productName}
          onIndexChange={setZoomIndex}
          onClose={() => setZoomIndex(null)}
        />
      )}
    </>
  );
}

function PagerArrow({ direction, onClick }: { direction: 'prev' | 'next'; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={direction === 'prev' ? 'Previous image' : 'Next image'}
      className="text-fg hover:text-signal grid h-11 w-11 place-items-center transition-colors"
    >
      <svg width="22" height="14" viewBox="0 0 22 14" fill="none" aria-hidden>
        <path
          d={direction === 'prev' ? 'M21 7H1m0 0 6-6M1 7l6 6' : 'M1 7h20m0 0-6-6m6 6-6 6'}
          stroke="currentColor"
          strokeWidth="1.5"
        />
      </svg>
    </button>
  );
}

/**
 * Fullscreen view.
 *
 * `object-contain` on void: at this size the customer is inspecting a garment,
 * and cropping to fill the frame is exactly the wrong trade — better to letterbox
 * than to hide a hem.
 */
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
      data-surface="void"
      className="bg-surface text-fg fixed inset-0 z-[95] flex animate-[fade-in_200ms_ease-out] flex-col"
    >
      <div className="flex h-14 shrink-0 items-center justify-between px-5">
        <span className="text-fg-faint text-xs tabular-nums">
          {index + 1} / {media.length}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close fullscreen view"
          className="text-fg hover:text-signal -mr-2 p-3 transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path d="m4 4 12 12M16 4 4 16" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </div>

      <div className="relative flex-1">
        <MediaFrame
          src={current.url}
          alt={current.alt}
          sizes="100vw"
          fit="contain"
          priority
          fallbackLabel={productName}
          ratioClassName="absolute inset-0 h-full w-full"
          className="!bg-transparent"
        />
      </div>

      {media.length > 1 && (
        <div className="flex h-20 shrink-0 items-center justify-center gap-6">
          <PagerArrow
            direction="prev"
            onClick={() => onIndexChange((index - 1 + media.length) % media.length)}
          />
          <PagerArrow direction="next" onClick={() => onIndexChange((index + 1) % media.length)} />
        </div>
      )}
    </div>
  );
}
