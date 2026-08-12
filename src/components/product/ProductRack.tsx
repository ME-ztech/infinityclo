'use client';

/**
 * The product rack.
 *
 * This replaces the New Arrivals grid, which was the worst surface in 1.0 on a
 * phone: eight products crammed two-across, names truncated to
 * "INFNITY'S REVERSI…", and two price stacks competing on every row. Showing
 * more inventory per screen was costing the brand the ability to sell any of it.
 *
 * Below `md` this is a garment rail. Each card takes 82% of the viewport, so the
 * next piece is always peeking in from the right — the affordance that tells a
 * thumb to swipe — and scroll-snap makes each swipe land cleanly on one garment.
 * You browse it the way you push hangers along a rail.
 *
 * From `md` up it becomes a spacious grid, because a mouse has no swipe and a
 * wide viewport can afford the columns.
 *
 * The switch is pure CSS. Nothing measures the viewport in JavaScript, so there
 * is no layout flash on hydration and no breakpoint state to get out of sync.
 *
 * The only JavaScript here is the progress line: a scroll-linked red rule under
 * the rail, driven by `transform: scaleX` inside a rAF so it stays on the
 * compositor. It is one of the few places red earns its keep — it reports a real
 * position rather than decorating.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { ProductCard } from '@/components/product/ProductCard';
import { RACK, RACK_GUTTER, RACK_ITEM } from '@/lib/rack';
import type { Product } from '@/domain/types';
import { cn } from '@/lib/cn';

interface ProductRackProps {
  products: readonly Product[];
  /** How many images to mark priority. Only ever the genuinely-visible first. */
  priorityCount?: number;
  /** Desktop column count once the rail becomes a grid. */
  columns?: 3 | 4;
  className?: string;
}

const COLUMN_CLASSES = {
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-3 xl:grid-cols-4',
} as const;

export function ProductRack({
  products,
  priorityCount = 1,
  columns = 4,
  className,
}: ProductRackProps) {
  const scrollerRef = useRef<HTMLUListElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [isScrollable, setIsScrollable] = useState(false);

  const measure = useCallback(() => {
    const node = scrollerRef.current;
    if (!node) return;
    const travel = node.scrollWidth - node.clientWidth;
    setIsScrollable(travel > 8);
    setProgress(travel > 0 ? Math.min(1, Math.max(0, node.scrollLeft / travel)) : 0);
  }, []);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;

    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };

    measure();
    node.addEventListener('scroll', onScroll, { passive: true });

    // The rail stops being scrollable when it becomes a grid at `md`, so the
    // progress line has to disappear on resize as well as on scroll.
    const observer = new ResizeObserver(onScroll);
    observer.observe(node);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      node.removeEventListener('scroll', onScroll);
      observer.disconnect();
    };
  }, [measure, products.length]);

  if (products.length === 0) return null;

  return (
    // `min-w-0` for the same reason the rail itself carries it: this wrapper is
    // whatever its parent makes it — a section child here, a grid item on some
    // future page — and the rail behind it has a min-content width of four
    // cards. Without this the recommendations could widen the document instead
    // of scrolling inside it.
    <div className={cn('relative min-w-0', className)}>
      <ul
        ref={scrollerRef}
        data-testid="product-rack"
        className={cn(
          // Mobile: full-bleed rail. Negative margin cancels the section gutter
          // so the rail runs edge to edge, and the inner padding puts the first
          // card back on the grid line.
          RACK,
          RACK_GUTTER,
          '-mx-(--spacing-gutter) gap-4 px-(--spacing-gutter) pb-2',
          // Desktop: grid. `overflow-visible` matters — the rail's clipping
          // would otherwise cut off the quick-add control on the top row.
          'md:mx-0 md:grid md:snap-none md:gap-x-6 md:gap-y-14 md:overflow-visible md:px-0 md:pb-0',
          COLUMN_CLASSES[columns],
        )}
      >
        {products.map((product, index) => (
          <li
            key={product.slug}
            className={cn(RACK_ITEM, 'w-[82vw] max-w-[21rem] sm:w-[62vw] md:w-auto md:max-w-none')}
          >
            <ProductCard
              product={product}
              variant="rack"
              priority={index < priorityCount}
              sizes="(min-width: 1280px) 24vw, (min-width: 768px) 31vw, 82vw"
            />
          </li>
        ))}
      </ul>

      {/* Progress line. Hidden from assistive tech — position in a scroll
          container is already conveyed by the scrollbar semantics, and a second
          announcement on every frame would be noise. */}
      {isScrollable && (
        <div aria-hidden className="bg-line/60 mt-6 h-px w-full overflow-hidden md:hidden">
          <div
            className="bg-signal h-full w-full origin-left"
            style={{ transform: `scaleX(${Math.max(0.08, progress)})` }}
          />
        </div>
      )}
    </div>
  );
}
