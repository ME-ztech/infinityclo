import { ProductCard } from '@/components/product/ProductCard';
import type { Product } from '@/domain/types';
import { cn } from '@/lib/cn';

const DENSITY_CLASSES = {
  comfortable: 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4',
  compact: 'grid-cols-2 md:grid-cols-4 xl:grid-cols-5',
  editorial: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
} as const;

export type GridDensity = keyof typeof DENSITY_CLASSES;

const DENSITY_SIZES: Record<GridDensity, string> = {
  comfortable: '(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 50vw',
  compact: '(min-width: 1280px) 20vw, (min-width: 768px) 25vw, 50vw',
  editorial: '(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw',
};

export function ProductGrid({
  products,
  density = 'comfortable',
  priorityCount = 4,
  className,
}: {
  products: readonly Product[];
  density?: GridDensity;
  /** How many images to mark priority — the first visible row. */
  priorityCount?: number;
  className?: string;
}) {
  return (
    <ul className={cn('grid gap-x-4 gap-y-10 md:gap-x-6', DENSITY_CLASSES[density], className)}>
      {products.map((product, index) => (
        <li key={product.slug}>
          <ProductCard
            product={product}
            priority={index < priorityCount}
            sizes={DENSITY_SIZES[density]}
          />
        </li>
      ))}
    </ul>
  );
}
