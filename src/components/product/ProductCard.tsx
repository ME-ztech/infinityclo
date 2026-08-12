'use client';

/**
 * Product card.
 *
 * The rule this card is built around: **the garment is the content, the type is
 * the caption.** 1.0 gave the photograph a small square and then competed with
 * it — truncated names, a right-aligned price stack, two products crammed across
 * a 390px phone. 1.1 inverts that.
 *
 * Decisions worth knowing:
 *
 * - **The image plate is always white**, even inside a black room. The legacy
 *   store shot every garment on white, so a white plate is the honest background
 *   for the photography — and in a dark section it turns each product into a lit
 *   frame on a gallery wall, which is the whole point of the contrast strategy.
 * - **Names wrap; they never truncate.** "INFNITY'S REVERSIBLE OBSIDIAN BLANK
 *   HOODIE" is the product's actual name and a customer scanning a rail needs to
 *   read it. Two lines of type cost less than an ellipsis costs in comprehension.
 * - **Price sits under the name, not beside it.** Side-by-side put the two in
 *   competition and forced both to shrink; stacked, the name leads and the price
 *   resolves.
 * - **Badges are facts.** NEW comes from a real publish date, the discount from a
 *   real compare-at price, SOLD OUT from real availability. There is no
 *   promotional badge a merchandiser can switch on without the fact being true.
 *
 * Hover behaviour is an enhancement, never the mechanism: on touch, where there
 * is no hover, the card still shows a full image, the name, the price and the
 * state. Nothing is hidden behind an interaction a phone cannot perform.
 */
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

import { MediaFrame } from '@/components/ui/MediaFrame';
import { QuickAddSheet } from '@/components/product/QuickAddSheet';
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
import { categoryGroupOf, labelForGroup } from '@/domain/taxonomy';
import type { Product } from '@/domain/types';
import { useCart } from '@/lib/cart/CartProvider';
import { cn } from '@/lib/cn';
import { useWishlist } from '@/lib/wishlist/useWishlist';

export interface ProductCardProps {
  product: Product;
  /** Prioritises the image for LCP. Use for the first visible row only. */
  priority?: boolean;
  sizes?: string;
  /** `rack` is the oversized mobile showroom card; `grid` is the catalogue card. */
  variant?: 'grid' | 'rack';
  /** Desktop hover quick-add. Off inside dense editorial rows. */
  enableQuickAdd?: boolean;
  className?: string;
}

export function ProductCard({
  product,
  priority = false,
  sizes = '(min-width: 1280px) 24vw, (min-width: 768px) 33vw, 88vw',
  variant = 'grid',
  enableQuickAdd = true,
  className,
}: ProductCardProps) {
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const wishlist = useWishlist();
  const { addLine } = useCart();

  const primary = primaryMedia(product);
  const secondary = secondaryMedia(product);
  const price = fromPrice(product);
  const compareAt = fromCompareAtPrice(product);
  const availability = productAvailability(product);
  const colours = colourValues(product);
  const group = categoryGroupOf(product);

  const soldOut = availability === 'sold_out';
  const archived = availability === 'archived';
  const isUnavailable = soldOut || archived;
  const isSaved = wishlist.isHydrated && wishlist.isSaved(product.slug);

  /**
   * The muted line under the name. Colour count is the more useful fact when a
   * product has several, and the garment type is the fallback — never both, so
   * the line stays a single quiet caption rather than a second heading.
   */
  const metaLine =
    colours.length > 1
      ? `${colours.length} colours`
      : (colours[0] ?? (group ? labelForGroup(group) : (product.category ?? null)));

  /**
   * Quick add is offered for anything buyable, not just anything with a size
   * run. A socks pack with one variant is exactly the piece a customer wants to
   * add without a detour through the product page — gating on sizes hid the
   * control precisely where it was most useful.
   *
   * Products with an option axis open the sheet; single-variant products go
   * straight into the bag, which is what the sheet would ask them to confirm
   * anyway.
   */
  const soleVariant = product.variants.length === 1 ? product.variants[0]! : null;
  const needsChoice = product.options.length > 0;
  const canQuickAdd =
    enableQuickAdd && !isUnavailable && (needsChoice || soleVariant?.availability === 'in_stock');

  return (
    <article
      className={cn('group/card relative flex flex-col', className)}
      data-testid="product-card"
    >
      <Link
        href={`/products/${product.slug}`}
        className="flex flex-col focus-visible:outline-offset-4"
      >
        {/* The showroom plate. Fixed to white regardless of the surrounding
            room — see the note at the top of this file. */}
        <div data-surface="paper" className="bg-surface relative">
          <MediaFrame
            src={primary?.url}
            alt={primary?.alt ?? `${product.name} — INFNITY`}
            sizes={sizes}
            priority={priority}
            fallbackLabel={product.name}
            ratioClassName="aspect-(--aspect-portrait)"
            imageClassName={cn(
              'transition-transform duration-[900ms] ease-(--ease-brand)',
              'group-hover/card:scale-[1.035]',
              secondary && 'group-hover/card:opacity-0',
            )}
          />

          {/* Hover shot. Decorative and duplicative of the primary alt, so it is
              hidden from assistive tech; it is never the only image.

              `overflow-hidden` matches the primary frame, which MediaFrame
              clips: without it the pre-scaled shot sat ~5px proud of the card on
              every side, so the last column of the desktop grid reported a
              wider scroll width than the grid box and the two images cropped
              differently as a customer hovered. */}
          {secondary && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 overflow-hidden opacity-0 transition-opacity duration-700 ease-(--ease-brand) group-hover/card:opacity-100"
            >
              <Image
                src={secondary.url}
                alt=""
                fill
                sizes={sizes}
                loading="lazy"
                className="scale-[1.035] object-cover"
              />
            </span>
          )}

          {isUnavailable && (
            <div className="bg-void/35 absolute inset-0 flex items-center justify-center">
              <span className="bg-paper text-ink px-4 py-2 text-[0.62rem] font-bold tracking-[0.22em] uppercase">
                {archived ? 'Archive' : 'Sold out'}
              </span>
            </div>
          )}

          <div className="pointer-events-none absolute top-0 left-0 flex flex-col items-start gap-px">
            {isNew(product) && !isUnavailable && (
              <span className="bg-ink text-paper px-2.5 py-1.5 text-[0.58rem] font-bold tracking-[0.2em] uppercase">
                New
              </span>
            )}
            {compareAt && price && !isUnavailable && (
              <span className="bg-signal text-paper px-2.5 py-1.5 text-[0.58rem] font-bold tracking-[0.2em] uppercase tabular-nums">
                −{discountPercent(price, compareAt)}%
              </span>
            )}
          </div>
        </div>

        <div className={cn('flex flex-col gap-1.5', variant === 'rack' ? 'mt-5' : 'mt-4')}>
          {/* `text-pretty` keeps a long product name from leaving one orphan word
              on its own line, which is where these names always broke. */}
          <h3
            className={cn(
              'text-fg text-pretty',
              variant === 'rack'
                ? 'text-[0.95rem] leading-snug font-semibold'
                : 'text-[0.86rem] leading-snug font-semibold',
            )}
          >
            {product.name}
          </h3>

          {metaLine && (
            <p className="text-fg-faint text-[0.66rem] tracking-[0.16em] uppercase">{metaLine}</p>
          )}

          <div className="mt-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            {price ? (
              <>
                <span
                  className={cn(
                    'text-[0.86rem] tabular-nums',
                    compareAt ? 'text-signal font-semibold' : 'text-fg font-medium',
                  )}
                >
                  {formatMoney(price)}
                </span>
                {compareAt && (
                  <span className="text-fg-faint text-[0.78rem] tabular-nums line-through">
                    {formatMoney(compareAt)}
                  </span>
                )}
              </>
            ) : (
              <span className="text-fg-faint text-[0.78rem]">Price unavailable</span>
            )}
          </div>

          {variant === 'rack' && (
            <span className="text-fg-faint mt-3 inline-flex items-center gap-2 text-[0.64rem] font-semibold tracking-[0.22em] uppercase">
              View piece
              <span
                aria-hidden
                className="transition-transform duration-300 ease-(--ease-brand) group-hover/card:translate-x-1"
              >
                →
              </span>
            </span>
          )}
        </div>
      </Link>

      {/* Controls sit outside the anchor so they are their own tab stops and a
          tap on either never navigates to the product page by accident. */}
      <button
        type="button"
        onClick={() => wishlist.toggle(product.slug)}
        aria-pressed={isSaved}
        aria-label={isSaved ? `Remove ${product.name} from wishlist` : `Save ${product.name}`}
        data-testid="wishlist-toggle"
        className={cn(
          'absolute top-2 right-2 grid h-11 w-11 place-items-center transition-colors duration-200',
          isSaved ? 'text-signal' : 'text-ink/45 hover:text-ink',
        )}
      >
        <HeartIcon filled={isSaved} />
      </button>

      {canQuickAdd && (
        /**
         * Anchored to the image, not the card, so the caption below stays
         * readable while the control is showing.
         *
         * Both wrappers stay `pointer-events-none` for their whole life and only
         * the button itself becomes clickable. An earlier version put
         * `pointer-events-auto` on the wrapper at hover, which handed the entire
         * image area to a transparent overlay — the card looked like a link and
         * silently was not one. Only the 48px strip at the foot of the image is
         * ever interactive.
         */
        <div className="pointer-events-none absolute inset-x-0 top-0 hidden aspect-(--aspect-portrait) md:block">
          <div className="pointer-events-none relative h-full">
            <button
              type="button"
              onClick={() => {
                if (needsChoice) {
                  setIsQuickAddOpen(true);
                  return;
                }
                if (soleVariant) {
                  void addLine({
                    productSlug: product.slug,
                    variantId: soleVariant.id,
                    quantity: 1,
                    productName: product.name,
                  });
                }
              }}
              className={cn(
                'bg-paper text-ink hover:bg-ink hover:text-paper absolute inset-x-0 bottom-0 h-12',
                'text-[0.66rem] font-bold tracking-[0.22em] uppercase',
                'pointer-events-none translate-y-2 opacity-0',
                'transition-[opacity,transform,background-color,color] duration-300 ease-(--ease-brand)',
                'group-hover/card:pointer-events-auto group-hover/card:translate-y-0 group-hover/card:opacity-100',
                'group-focus-within/card:pointer-events-auto group-focus-within/card:translate-y-0 group-focus-within/card:opacity-100',
              )}
            >
              {needsChoice ? 'Quick add' : 'Add to bag'}
            </button>
          </div>
        </div>
      )}

      {isQuickAddOpen && (
        <QuickAddSheet product={product} onClose={() => setIsQuickAddOpen(false)} />
      )}
    </article>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="19" height="19" viewBox="0 0 20 20" fill="none" aria-hidden focusable="false">
      <path
        d="M10 16.5 3.7 10.4a3.7 3.7 0 1 1 5.2-5.2l1.1 1 1.1-1a3.7 3.7 0 1 1 5.2 5.2L10 16.5Z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
