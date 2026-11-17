'use client';

/**
 * "You may also like" in the cart.
 *
 * Off by default. The resolver only returns recommendations when the owner has
 * switched the cart placement on in admin, so this renders nothing otherwise.
 * It only ever links to a product page: nothing is added to a cart without the
 * customer choosing it there.
 */
import Image from 'next/image';
import Link from 'next/link';

import { formatMoney } from '@/domain/money';
import { fromPrice, primaryMedia } from '@/domain/product';
import { useCart } from '@/lib/cart/CartProvider';
import { cn } from '@/lib/cn';

export function CartRecommendations({ variant }: { variant: 'drawer' | 'page' }) {
  const { recommendations, closeDrawer } = useCart();

  if (recommendations.length === 0) return null;

  return (
    <section
      aria-labelledby={`cart-recs-${variant}`}
      data-testid="cart-recommendations"
      className={cn(variant === 'drawer' ? 'border-line border-t px-5 py-5' : 'mt-14')}
    >
      <h2
        id={`cart-recs-${variant}`}
        className={cn(
          variant === 'drawer'
            ? 'text-xs font-semibold tracking-[0.18em] uppercase'
            : 'font-display text-title text-fg text-center',
        )}
      >
        You may also like
      </h2>
      <ul
        className={cn(
          'mt-4 grid gap-3',
          variant === 'drawer' ? 'grid-cols-2' : 'grid-cols-2 md:mt-8 md:grid-cols-4 md:gap-5',
        )}
      >
        {recommendations.slice(0, variant === 'drawer' ? 2 : 4).map((product) => {
          const media = primaryMedia(product);
          const price = fromPrice(product);
          return (
            <li key={product.slug}>
              <Link href={`/products/${product.slug}`} onClick={closeDrawer} className="group block">
                <div className="bg-surface-sunken relative aspect-square overflow-hidden">
                  {media && (
                    <Image
                      src={media.url}
                      alt={media.alt}
                      fill
                      sizes="(min-width: 768px) 20vw, 45vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                  )}
                </div>
                <p className="text-fg mt-2 line-clamp-2 text-xs font-semibold">{product.name}</p>
                {price && (
                  <p className="text-fg-muted mt-0.5 text-xs tabular-nums">{formatMoney(price)}</p>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
