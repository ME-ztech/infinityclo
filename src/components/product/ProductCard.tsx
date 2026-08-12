'use client';

/**
 * Product card.
 *
 * Hover cross-fades to a second shot where one exists. That is an enhancement,
 * not the mechanism: on touch, where there is no hover, the card still shows a
 * full image, name, price and state. Nothing is hidden behind an interaction a
 * phone cannot perform.
 *
 * Badges are rendered only from facts in the data — NEW from a real publish
 * date, SALE from a real compare-at price, SOLD OUT from real availability.
 * There is no promotional badge that a merchandiser can switch on without the
 * underlying fact being true.
 */
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

import { discountPercent, formatMoney } from '@/domain/money';
import {
  colourValues,
  fromCompareAtPrice,
  fromPrice,
  isNew,
  primaryMedia,
  productAvailability,
  secondaryMedia,
} from '@/domain/product';
import type { Product } from '@/domain/types';
import { cn } from '@/lib/cn';

interface ProductCardProps {
  product: Product;
  /** Prioritises the image for LCP. Use for the first row only. */
  priority?: boolean;
  sizes?: string;
  className?: string;
}

export function ProductCard({
  product,
  priority = false,
  sizes = '(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 50vw',
  className,
}: ProductCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [hasImageError, setHasImageError] = useState(false);

  const primary = primaryMedia(product);
  const secondary = secondaryMedia(product);
  const price = fromPrice(product);
  const compareAt = fromCompareAtPrice(product);
  const availability = productAvailability(product);
  const colours = colourValues(product);
  const soldOut = availability === 'sold_out';
  const archived = availability === 'archived';

  return (
    <article
      className={cn('group relative', className)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      data-testid="product-card"
    >
      <Link href={`/products/${product.slug}`} className="block focus-visible:outline-offset-4">
        <div className="bg-carbon relative aspect-[--aspect-portrait] overflow-hidden">
          {primary && !hasImageError ? (
            <>
              <Image
                src={primary.url}
                alt={primary.alt}
                fill
                sizes={sizes}
                priority={priority}
                onError={() => setHasImageError(true)}
                className={cn(
                  'object-cover transition-[opacity,transform] duration-700 ease-[--ease-brand]',
                  'group-hover:scale-[1.03]',
                  isHovered && secondary ? 'opacity-0' : 'opacity-100',
                )}
              />
              {secondary && (
                <Image
                  src={secondary.url}
                  alt=""
                  aria-hidden
                  fill
                  sizes={sizes}
                  className={cn(
                    'scale-[1.03] object-cover transition-opacity duration-700 ease-[--ease-brand]',
                    isHovered ? 'opacity-100' : 'opacity-0',
                  )}
                />
              )}
            </>
          ) : (
            // Image failure and missing imagery share one honest fallback: the
            // product name on a flat surface. Never a broken-image icon.
            <div className="text-dim flex h-full w-full items-center justify-center p-6 text-center">
              <span className="font-display text-sm tracking-[0.14em]">{product.name}</span>
            </div>
          )}

          {(soldOut || archived) && (
            <div className="bg-void/45 absolute inset-0 flex items-center justify-center">
              <span className="border-paper text-paper border px-3 py-1.5 text-[0.65rem] font-semibold tracking-[0.18em] uppercase">
                {archived ? 'Archive' : 'Sold out'}
              </span>
            </div>
          )}

          <div className="absolute top-3 left-3 flex flex-col items-start gap-1.5">
            {isNew(product) && !soldOut && (
              <span className="bg-paper text-void px-2 py-1 text-[0.6rem] font-bold tracking-[0.16em] uppercase">
                New
              </span>
            )}
            {compareAt && price && !soldOut && (
              <span className="bg-signal text-paper px-2 py-1 text-[0.6rem] font-bold tracking-[0.16em] uppercase">
                −{discountPercent(price, compareAt)}%
              </span>
            )}
          </div>
        </div>

        <div className="mt-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-bone group-hover:text-paper truncate text-sm font-semibold transition-colors">
              {product.name}
            </h3>
            {colours.length > 1 && (
              <p className="text-dim mt-1 text-[0.68rem] tracking-[0.1em] uppercase">
                {colours.length} colours
              </p>
            )}
          </div>

          <div className="shrink-0 text-right">
            {price ? (
              <>
                <p
                  className={cn(
                    'text-sm tabular-nums',
                    compareAt ? 'text-signal font-semibold' : 'text-bone',
                  )}
                >
                  {formatMoney(price)}
                </p>
                {compareAt && (
                  <p className="text-dim text-xs tabular-nums line-through">
                    {formatMoney(compareAt)}
                  </p>
                )}
              </>
            ) : (
              <p className="text-dim text-xs">—</p>
            )}
          </div>
        </div>
      </Link>
    </article>
  );
}
