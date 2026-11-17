'use client';

/**
 * The buy panel.
 *
 * Owns variant selection, quantity and add-to-cart, and lifts the selected
 * variant's image id so the gallery can follow a colour change.
 *
 * Option buttons have three unambiguous states: selected is filled, available
 * is outlined, unavailable is struck through and dimmed. Unreachable values are
 * shown struck rather than hidden — a customer looking for a sold-out size needs
 * to see that it exists and is gone.
 *
 * The call to action always states what will be charged for the current
 * selection: `ADD TO CART — $XX.XX` is the selected variant's price multiplied
 * by the quantity. A sold-out variant disables it and says so.
 *
 * A sticky purchase bar appears on mobile once the inline button scrolls away.
 * It is `sticky` inside the page flow rather than `fixed`, so it can never
 * overlap the footer or trap content underneath it.
 */
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import { ProductDetails, type ProductDetailSections } from '@/components/product/ProductDetails';
import { SizeGuideDialog } from '@/components/product/SizeGuideDialog';
import { Button } from '@/components/ui/Button';
import { discountPercent, formatMoney, isDiscounted, multiplyMoney } from '@/domain/money';
import { findVariant, isOptionValueAvailable, isSizeOption } from '@/domain/product';
import type { SizeChart } from '@/domain/size-charts';
import { categoryGroupOf, labelForGroup } from '@/domain/taxonomy';
import type { Product } from '@/domain/types';
import { useCart } from '@/lib/cart/CartProvider';
import { cn } from '@/lib/cn';
import { useWishlist } from '@/lib/wishlist/useWishlist';

const MAX_QUANTITY = 10;

interface PanelProps {
  product: Product;
  sizeChart: SizeChart | null;
  details: ProductDetailSections;
  onActiveMediaChange?: (mediaId: string | null) => void;
}

export function ProductPurchasePanel({
  product,
  sizeChart,
  details,
  onActiveMediaChange,
}: PanelProps) {
  const { addLine, isPending } = useCart();
  const wishlist = useWishlist();

  // Seed each option with its first *available* value so the panel opens on a
  // buyable combination wherever one exists.
  const [selections, setSelections] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const option of product.options) {
      const firstAvailable = option.values.find((value) =>
        product.variants.some(
          (variant) =>
            variant.selectedOptions[option.name] === value && variant.availability !== 'sold_out',
        ),
      );
      const seed = firstAvailable ?? option.values[0];
      if (seed) initial[option.name] = seed;
    }
    return initial;
  });

  const [quantity, setQuantity] = useState(1);
  const [isSizeGuideOpen, setIsSizeGuideOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isInlineButtonVisible, setIsInlineButtonVisible] = useState(true);
  const inlineButtonRef = useRef<HTMLDivElement | null>(null);

  const variant = useMemo(() => findVariant(product, selections), [product, selections]);

  useEffect(() => {
    onActiveMediaChange?.(variant?.mediaId ?? null);
  }, [onActiveMediaChange, variant?.mediaId]);

  useEffect(() => {
    const target = inlineButtonRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      // The bar is for when the button has been scrolled *past*. While the
      // button is still below the fold the page has not got there yet.
      ([entry]) =>
        setIsInlineButtonVisible(
          !entry || entry.isIntersecting || entry.boundingClientRect.top > 0,
        ),
      { rootMargin: '-80px 0px 0px 0px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  const isArchived = variant?.availability === 'archived';
  const isSoldOut = !variant || variant.availability === 'sold_out' || isArchived;
  const price = variant?.price ?? null;
  const compareAt = variant?.compareAtPrice ?? null;
  const onSale = price && compareAt ? isDiscounted(price, compareAt) : false;
  const total = price ? multiplyMoney(price, quantity) : null;

  const group = categoryGroupOf(product);
  const categoryLine = product.category ?? (group ? labelForGroup(group) : null);
  const isSaved = wishlist.isHydrated && wishlist.isSaved(product.slug);
  const hasSizeOption = product.options.some((option) => isSizeOption(option.name));

  async function handleAdd() {
    if (!variant || isSoldOut) return;
    await addLine({
      productSlug: product.slug,
      variantId: variant.id,
      quantity,
      productName: product.name,
    });
    setFeedback(quantity > 1 ? `${quantity} added to cart` : 'Added to cart');
    window.setTimeout(() => setFeedback(null), 2500);
  }

  const ctaLabel = isSoldOut
    ? 'Sold out'
    : isPending
      ? 'Adding…'
      : total
        ? `Add to cart — ${formatMoney(total)}`
        : 'Add to cart';

  return (
    <div className="flex flex-col">
      {categoryLine && (
        <p className="text-fg-faint mb-3 text-[0.66rem] font-semibold tracking-[0.28em] uppercase">
          {categoryLine}
        </p>
      )}

      <h1 className="font-display text-fg text-[clamp(1.8rem,5vw,2.75rem)] leading-[1.02] text-balance">
        {product.name}
      </h1>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-2" data-testid="pdp-price">
        {price ? (
          <>
            <span className="text-fg text-xl font-semibold tabular-nums">
              {formatMoney(price)}
              <span className="text-fg-faint ml-1.5 text-[0.7rem] font-medium tracking-[0.1em]">
                {price.currency}
              </span>
            </span>
            {onSale && compareAt && (
              <>
                <span className="text-fg-faint text-sm tabular-nums line-through">
                  <span className="sr-only">Was </span>
                  {formatMoney(compareAt)}
                </span>
                <span className="bg-signal text-paper px-2 py-1 text-[0.58rem] font-bold tracking-[0.16em] uppercase tabular-nums">
                  −{discountPercent(price, compareAt)}% off
                </span>
              </>
            )}
          </>
        ) : (
          <span className="text-fg-faint text-sm">Price unavailable</span>
        )}
      </div>

      {/* ── Options ─────────────────────────────────────────────────── */}
      <div className="mt-8 flex flex-col gap-7">
        {product.options.map((option) => {
          const isSize = isSizeOption(option.name);
          return (
            <fieldset key={option.id} className="border-hairline border-b pb-7">
              <div className="mb-3 flex items-baseline justify-between gap-4">
                <legend className="text-fg text-sm">
                  {option.name}
                  {selections[option.name] && (
                    <span className="text-fg-muted ml-2 text-sm">{selections[option.name]}</span>
                  )}
                </legend>

                {isSize && sizeChart && (
                  <button
                    type="button"
                    onClick={() => setIsSizeGuideOpen(true)}
                    data-testid="size-guide-open"
                    className="text-fg -my-3 flex min-h-11 items-center text-[0.7rem] font-semibold tracking-[0.14em] uppercase underline underline-offset-4"
                  >
                    Size guide
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {option.values.map((value) => {
                  const isSelected = selections[option.name] === value;
                  const isAvailable = isOptionValueAvailable(
                    product,
                    option.name,
                    value,
                    selections,
                  );

                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() =>
                        setSelections((current) => ({ ...current, [option.name]: value }))
                      }
                      aria-pressed={isSelected}
                      data-testid={isSize ? 'size-option' : 'product-option'}
                      data-available={isAvailable}
                      className={cn(
                        'relative grid h-12 min-w-12 place-items-center border px-4 text-[0.82rem] font-semibold tracking-[0.04em] transition-[background-color,border-color,color] duration-200',
                        isSelected
                          ? 'border-inverse-surface bg-inverse-surface text-inverse-fg'
                          : 'border-line text-fg hover:border-fg',
                        !isAvailable && !isSelected && 'text-fg-faint border-hairline',
                      )}
                    >
                      <span className={cn(!isAvailable && 'line-through')}>{value}</span>
                      {!isAvailable && <span className="sr-only"> (sold out)</span>}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          );
        })}

        {/* A product with no size axis still gets its guide, when one exists. */}
        {!hasSizeOption && sizeChart && (
          <button
            type="button"
            onClick={() => setIsSizeGuideOpen(true)}
            data-testid="size-guide-open"
            className="text-fg flex min-h-11 items-center self-start text-[0.7rem] font-semibold tracking-[0.14em] uppercase underline underline-offset-4"
          >
            Size guide
          </button>
        )}

        {/* ── Quantity ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4">
          <span id="quantity-label" className="text-fg text-sm">
            Quantity
          </span>
          <div
            role="group"
            aria-labelledby="quantity-label"
            className="border-line flex h-12 items-stretch border"
          >
            <button
              type="button"
              onClick={() => setQuantity((value) => Math.max(1, value - 1))}
              disabled={quantity <= 1 || isSoldOut}
              aria-label="Decrease quantity"
              className="text-fg disabled:text-fg-faint grid w-12 place-items-center text-lg"
            >
              −
            </button>
            <output
              aria-live="polite"
              data-testid="pdp-quantity"
              className="text-fg border-line grid w-12 place-items-center border-x text-sm font-semibold tabular-nums"
            >
              {quantity}
            </output>
            <button
              type="button"
              onClick={() => setQuantity((value) => Math.min(MAX_QUANTITY, value + 1))}
              disabled={quantity >= MAX_QUANTITY || isSoldOut}
              aria-label="Increase quantity"
              className="text-fg disabled:text-fg-faint grid w-12 place-items-center text-lg"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* ── Availability ────────────────────────────────────────────── */}
      <p
        className="mt-6 min-h-5 text-[0.7rem] font-semibold tracking-[0.16em] uppercase"
        aria-live="polite"
        data-testid="pdp-availability"
      >
        {isSoldOut ? (
          <span className="text-signal">
            {variant ? 'This option is sold out' : 'This combination is not available'}
          </span>
        ) : variant?.availability === 'low_stock' ? (
          <span className="text-fg">Low stock</span>
        ) : (
          <span className="text-fg-muted">In stock</span>
        )}
      </p>

      <div ref={inlineButtonRef} className="mt-3 flex items-stretch gap-2.5">
        <Button
          variant="primary"
          size="lg"
          fullWidth
          disabled={isSoldOut || isPending}
          onClick={() => void handleAdd()}
          data-testid="add-to-cart"
          className="min-w-0 px-4"
        >
          {ctaLabel}
        </Button>

        <button
          type="button"
          onClick={() => wishlist.toggle(product.slug)}
          aria-pressed={isSaved}
          aria-label={isSaved ? 'Remove from wishlist' : 'Save to wishlist'}
          data-testid="wishlist-toggle"
          className={cn(
            'border-line hover:border-fg grid h-14 w-14 shrink-0 place-items-center border transition-colors duration-200',
            isSaved ? 'border-fg text-fg' : 'text-fg',
          )}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path
              d="M10 16.5 3.7 10.4a3.7 3.7 0 1 1 5.2-5.2l1.1 1 1.1-1a3.7 3.7 0 1 1 5.2 5.2L10 16.5Z"
              fill={isSaved ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <Link
        href="/shop"
        data-testid="continue-shopping"
        className="border-fg text-fg hover:bg-fg/[0.04] mt-2.5 flex h-14 items-center justify-center border text-[0.78rem] font-semibold tracking-[0.2em] uppercase transition-colors"
      >
        Continue shopping →
      </Link>

      <p role="status" className="text-fg mt-3 min-h-4 text-center text-xs font-semibold">
        {feedback}
      </p>

      {product.description && (
        <div
          className="text-fg-muted mt-4 flex flex-col gap-3 text-sm leading-relaxed"
          data-testid="pdp-description"
        >
          {product.description.split('\n\n').map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      )}

      <ProductDetails sections={details} />

      {/* ── Sticky mobile purchase bar ──────────────────────────────── */}
      <div
        data-surface="paper"
        className={cn(
          'bg-surface/95 border-line sticky bottom-0 z-30 -mx-(--spacing-gutter) mt-8 border-t px-(--spacing-gutter) py-3 backdrop-blur-md transition-opacity duration-200 md:hidden',
          isInlineButtonVisible ? 'pointer-events-none opacity-0' : 'opacity-100',
        )}
        aria-hidden={isInlineButtonVisible}
      >
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-fg truncate text-xs font-semibold">{product.name}</p>
            {total && <p className="text-fg-muted text-xs tabular-nums">{formatMoney(total)}</p>}
          </div>
          <Button
            variant="primary"
            size="md"
            disabled={isSoldOut || isPending || isInlineButtonVisible}
            onClick={() => void handleAdd()}
            className="shrink-0"
          >
            {isSoldOut ? 'Sold out' : 'Add to cart'}
          </Button>
        </div>
      </div>

      {sizeChart && (
        <SizeGuideDialog
          chart={sizeChart}
          isOpen={isSizeGuideOpen}
          onClose={() => setIsSizeGuideOpen(false)}
        />
      )}
    </div>
  );
}
