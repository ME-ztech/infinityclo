'use client';

/**
 * The buy panel.
 *
 * Owns variant selection and add-to-bag, and lifts the selected variant's image
 * id so the gallery can follow a colour change.
 *
 * The size selector keeps the oversized, tactile presentation from the legacy
 * storefront — big type, real spacing, nothing smaller than a thumb — because
 * that personality is worth keeping. What it adds is unambiguous state: selected
 * is filled, available is outlined, unavailable is struck through and dimmed.
 *
 * Unreachable values are shown struck rather than hidden. A customer looking for
 * a sold-out size needs to see that it exists and is gone, not be left wondering
 * whether the brand makes it at all.
 *
 * A sticky purchase bar appears on mobile once the inline button scrolls away.
 * It is `sticky` inside the page flow rather than `fixed`, so it can never
 * overlap the footer or trap content underneath it.
 */
import { useEffect, useMemo, useRef, useState } from 'react';

import Link from 'next/link';

import { ProductDescription, ProductDetails } from '@/components/product/ProductDetails';
import { SizeGuideDialog } from '@/components/product/SizeGuideDialog';
import { Button } from '@/components/ui/Button';
import { discountPercent, formatMoney, isDiscounted } from '@/domain/money';
import { findVariant, isOptionValueAvailable, isSizeOption } from '@/domain/product';
import { categoryGroupOf, labelForGroup } from '@/domain/taxonomy';
import type { Product, SizeGuide } from '@/domain/types';
import { useCart } from '@/lib/cart/CartProvider';
import { cn } from '@/lib/cn';
import { useWishlist } from '@/lib/wishlist/useWishlist';

interface PanelProps {
  product: Product;
  sizeGuide: SizeGuide | null;
  onActiveMediaChange?: (mediaId: string | null) => void;
  /** Live, Shopify-backed offers that apply to this piece (never drafts). */
  offerMessages?: readonly string[];
  /** Other colourways sold as separate products with the same name. */
  siblings?: ReadonlyArray<{ slug: string; label: string }>;
}

export function ProductPurchasePanel({ product, sizeGuide, onActiveMediaChange, offerMessages = [], siblings = [] }: PanelProps) {
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
      ([entry]) => setIsInlineButtonVisible(entry?.isIntersecting ?? true),
      { rootMargin: '-80px 0px 0px 0px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  const isSoldOut = !variant || variant.availability === 'sold_out';
  const isArchived = variant?.availability === 'archived';
  const price = variant?.price ?? null;
  const compareAt = variant?.compareAtPrice ?? null;
  const onSale = price && compareAt ? isDiscounted(price, compareAt) : false;

  const group = categoryGroupOf(product);
  const categoryLine = product.category ?? (group ? labelForGroup(group) : null);
  const isSaved = wishlist.isHydrated && wishlist.isSaved(product.slug);

  async function handleAdd() {
    if (!variant || isSoldOut) return;
    await addLine({
      productSlug: product.slug,
      variantId: variant.id,
      quantity: 1,
      productName: product.name,
    });
    setFeedback('Added to cart');
    window.setTimeout(() => setFeedback(null), 2500);
  }

  return (
    <div className="flex flex-col">
      {categoryLine && (
        <p className="text-fg-faint mb-3 text-[0.66rem] font-semibold tracking-[0.28em] uppercase">
          {categoryLine}
        </p>
      )}

      <h1 className="font-display text-fg text-[clamp(1.6rem,4vw,2.5rem)] leading-[1.05] text-balance">
        {product.name}
      </h1>

      <div className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-2">
        {price ? (
          <>
            <span
              className={cn(
                'text-xl tabular-nums',
                onSale ? 'text-signal font-semibold' : 'text-fg font-medium',
              )}
            >
              {formatMoney(price)}
            </span>
            {onSale && compareAt && (
              <>
                <span className="text-fg-faint text-sm tabular-nums line-through">
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

      {siblings.length > 0 && (
        <div className="mt-6">
          <p className="text-fg-faint mb-3 text-[0.66rem] font-semibold tracking-[0.24em] uppercase">Also in</p>
          <div className="flex flex-wrap gap-2">
            {siblings.map((sibling) => (
              <Link
                key={sibling.slug}
                href={`/products/${sibling.slug}`}
                className="border-line hover:border-fg text-fg flex h-11 items-center border px-4 text-[0.78rem] font-semibold tracking-[0.06em] uppercase transition-colors"
              >
                {sibling.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      {offerMessages.length > 0 && (
        <ul className="mt-6 flex flex-col gap-1.5" data-testid="pdp-offers">
          {offerMessages.map((message) => (
            <li key={message} className="border-fg text-fg border-l-2 pl-3 text-xs font-medium">
              {message}
            </li>
          ))}
        </ul>
      )}

      {/* ── Options ─────────────────────────────────────────────────── */}
      <div className="mt-9 flex flex-col gap-8">
        {product.options.map((option) => {
          const isSize = isSizeOption(option.name);
          return (
            <fieldset key={option.id}>
              <div className="mb-4 flex items-baseline justify-between gap-4">
                <legend className="text-fg-faint text-[0.66rem] font-semibold tracking-[0.24em] uppercase">
                  {option.name}
                  {selections[option.name] && (
                    <span className="text-fg ml-2.5 text-[0.8rem] font-semibold normal-case">
                      {selections[option.name]}
                    </span>
                  )}
                </legend>

                {isSize &&
                  (sizeGuide ? (
                    <button
                      type="button"
                      onClick={() => setIsSizeGuideOpen(true)}
                      data-testid="size-guide-button"
                      className="text-fg-muted hover:text-fg min-h-11 text-[0.7rem] tracking-[0.14em] uppercase underline underline-offset-4 transition-colors"
                    >
                      Size guide
                    </button>
                  ) : (
                    <Link
                      href="/size-guide"
                      className="text-fg-muted hover:text-fg flex min-h-11 items-center text-[0.7rem] tracking-[0.14em] uppercase underline underline-offset-4 transition-colors"
                    >
                      Size help
                    </Link>
                  ))}
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
                      className={cn(
                        // 56px tall and at least 56px wide: fashion-scale
                        // targets, comfortably above the 44px minimum.
                        'relative grid h-14 min-w-14 place-items-center border px-5 text-[0.82rem] font-semibold tracking-[0.06em] uppercase transition-[background-color,border-color,color] duration-200',
                        isSelected
                          ? 'border-inverse-surface bg-inverse-surface text-inverse-fg'
                          : 'border-line text-fg hover:border-fg',
                        !isAvailable && !isSelected && 'text-fg-faint border-line/60',
                      )}
                    >
                      {value}
                      {!isAvailable && (
                        <>
                          <span
                            aria-hidden
                            className={cn(
                              'absolute inset-x-2.5 top-1/2 h-px -rotate-[18deg]',
                              isSelected ? 'bg-inverse-fg' : 'bg-fg-faint',
                            )}
                          />
                          <span className="sr-only"> (unavailable)</span>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
      </div>

      {/* ── Availability ────────────────────────────────────────────── */}
      <div className="mt-7 min-h-5" aria-live="polite">
        {isArchived ? (
          <p className="text-fg-muted text-[0.7rem] font-semibold tracking-[0.16em] uppercase">
            Archive — no longer available
          </p>
        ) : isSoldOut ? (
          <p className="text-signal text-[0.7rem] font-semibold tracking-[0.16em] uppercase">
            Sold out
          </p>
        ) : variant?.availability === 'low_stock' ? (
          <p className="text-fg text-[0.7rem] font-semibold tracking-[0.16em] uppercase">
            Low stock
          </p>
        ) : null}
      </div>

      <div className="mt-6">
        <ProductDetails product={product} />
      </div>

      <div ref={inlineButtonRef} className="mt-8 flex items-stretch gap-2.5">
        <Button
          variant="primary"
          size="lg"
          fullWidth
          disabled={isSoldOut || isPending}
          onClick={() => void handleAdd()}
          data-testid="add-to-cart"
        >
          {isSoldOut
            ? isArchived
              ? 'Archived'
              : 'Sold out'
            : isPending
              ? 'Adding…'
              : `Add to cart${price ? ` — ${formatMoney(price)}` : ''}`}
        </Button>

        <button
          type="button"
          onClick={() => wishlist.toggle(product.slug)}
          aria-pressed={isSaved}
          aria-label={isSaved ? 'Remove from wishlist' : 'Save to wishlist'}
          data-testid="wishlist-toggle"
          className={cn(
            'border-line hover:border-fg grid h-14 w-14 shrink-0 place-items-center border transition-colors duration-200',
            isSaved ? 'text-signal border-signal' : 'text-fg',
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
        className="border-fg text-fg hover:bg-fg hover:text-paper mt-2.5 flex h-14 items-center justify-center border text-[0.78rem] font-semibold tracking-[0.2em] uppercase transition-colors"
      >
        Continue shopping →
      </Link>

      <p role="status" className="text-fg-muted mt-3 min-h-4 text-center text-xs">
        {feedback}
      </p>

      <ProductDescription product={product} />

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
            {price && (
              <p
                className={cn(
                  'text-xs tabular-nums',
                  onSale ? 'text-signal font-semibold' : 'text-fg-muted',
                )}
              >
                {formatMoney(price)}
              </p>
            )}
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

      {sizeGuide && (
        <SizeGuideDialog
          guide={sizeGuide}
          isOpen={isSizeGuideOpen}
          onClose={() => setIsSizeGuideOpen(false)}
        />
      )}
    </div>
  );
}
