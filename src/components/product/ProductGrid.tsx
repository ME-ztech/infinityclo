import { ProductCard } from '@/components/product/ProductCard';
import type { Product } from '@/domain/types';
import { cn } from '@/lib/cn';

/**
 * The catalogue grid.
 *
 * Two columns on a phone, which is what the brand's own storefront does and what
 * a customer scanning a catalogue expects — the 1.0 problem was never the column
 * count, it was that the cards inside were cramped, truncated and fighting each
 * other. With the card fixed, the grid's job is simply to give it room:
 * `gap-y` is deliberately three times `gap-x`, so rows read as separate shelves
 * rather than a wall of thumbnails.
 *
 * `editorial` drops to a single column on mobile and three on desktop, for
 * surfaces where a handful of pieces should feel curated rather than listed.
 */
const DENSITY_CLASSES = {
  showroom: 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4',
  editorial: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
} as const;

export type GridDensity = keyof typeof DENSITY_CLASSES;

const DENSITY_SIZES: Record<GridDensity, string> = {
  showroom: '(min-width: 1280px) 24vw, (min-width: 768px) 31vw, 46vw',
  editorial: '(min-width: 1024px) 31vw, (min-width: 640px) 46vw, 92vw',
};

export function ProductGrid({
  products,
  density = 'showroom',
  priorityCount = 2,
  startIndex = 0,
  className,
}: {
  products: readonly Product[];
  density?: GridDensity;
  /** How many images to mark priority — the first visible row only. */
  priorityCount?: number;
  /** Offset when a grid is one of several chunks, so priority stays accurate. */
  startIndex?: number;
  className?: string;
}) {
  return (
    <ul
      className={cn(
        'grid gap-x-4 gap-y-12 sm:gap-x-6 md:gap-y-16',
        DENSITY_CLASSES[density],
        className,
      )}
    >
      {products.map((product, index) => (
        <li key={product.slug}>
          <ProductCard
            product={product}
            priority={startIndex + index < priorityCount}
            sizes={DENSITY_SIZES[density]}
          />
        </li>
      ))}
    </ul>
  );
}
