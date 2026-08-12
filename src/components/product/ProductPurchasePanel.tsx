'use client';

/**
 * The buy panel.
 *
 * Owns variant selection and add-to-cart, and lifts the selected variant's
 * image id so the gallery can follow a colour change.
 *
 * Unreachable option values are shown struck through rather than hidden: a
 * customer looking for a sold-out size needs to see that it exists and is gone,
 * not be left wondering whether the brand makes it at all.
 *
 * A sticky purchase bar appears on mobile once the inline button scrolls away.
 * It is `sticky` inside the page flow rather than `fixed`, so it can never
 * overlap the footer or trap content underneath it.
 */
import { useEffect, useMemo, useRef, useState } from 'react';

import { SizeGuideDialog } from '@/components/product/SizeGuideDialog';
import { Button } from '@/components/ui/Button';
import { discountPercent, formatMoney, isDiscounted } from '@/domain/money';
import {
  findVariant,
  isColourOption,
  isOptionValueAvailable,
  isSizeOption,
} from '@/domain/product';
import type { Product, SizeGuide } from '@/domain/types';
import { useCart } from '@/lib/cart/CartProvider';
import { cn } from '@/lib/cn';

interface PanelProps {
  product: Product;
  sizeGuide: SizeGuide | null;
  onActiveMediaChange?: (mediaId: string | null) => void;
}

export function ProductPurchasePanel({ product, sizeGuide, onActiveMediaChange }: PanelProps) {
  const { addLine, isPending } = useCart();

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
  const price = variant?.price ?? null;
  const compareAt = variant?.compareAtPrice ?? null;
  const onSale = price && compareAt ? isDiscounted(price, compareAt) : false;

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
      <h1 className="font-display text-title text-paper">{product.name}</h1>

      {product.category && (
        <p className="text-dim mt-2 text-[0.7rem] tracking-[0.16em] uppercase">
          {product.category}
        </p>
      )}

      <div className="mt-5 flex items-baseline gap-3">
        {price ? (
          <>
            <span
              className={cn(
                'text-xl tabular-nums',
                onSale ? 'text-signal font-semibold' : 'text-paper',
              )}
            >
              {formatMoney(price)}
            </span>
            {onSale && compareAt && (
              <>
                <span className="text-dim text-sm tabular-nums line-through">
                  {formatMoney(compareAt)}
                </span>
                <span className="bg-signal text-paper px-1.5 py-0.5 text-[0.6rem] font-bold tracking-[0.1em] uppercase">
                  −{discountPercent(price, compareAt)}%
                </span>
              </>
            )}
          </>
        ) : (
          <span className="text-dim text-sm">Price unavailable</span>
        )}
      </div>

      {/* Option selectors */}
      <div className="mt-8 flex flex-col gap-7">
        {product.options.map((option) => {
          const isSize = isSizeOption(option.name);
          return (
            <fieldset key={option.id}>
              <div className="mb-3 flex items-baseline justify-between gap-4">
                <legend className="text-dim text-[0.68rem] font-semibold tracking-[0.2em] uppercase">
                  {option.name}
                  {selections[option.name] && (
                    <span className="text-bone ml-2 normal-case">{selections[option.name]}</span>
                  )}
                </legend>

                {isSize && sizeGuide && (
                  <button
                    type="button"
                    onClick={() => setIsSizeGuideOpen(true)}
                    className="text-bone hover:text-paper text-[0.68rem] tracking-[0.12em] uppercase underline underline-offset-4"
                  >
                    Size guide
                  </button>
                )}
              </div>

              <div className={cn('flex flex-wrap gap-2', isColourOption(option.name) && 'gap-2.5')}>
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
                        'relative min-w-12 border px-4 py-3 text-xs font-semibold tracking-[0.08em] uppercase transition-colors',
                        isSelected
                          ? 'border-paper bg-paper text-void'
                          : 'border-ash text-bone hover:border-bone',
                        !isAvailable && 'text-dim border-ash/60',
                      )}
                    >
                      {value}
                      {!isAvailable && (
                        <span
                          aria-hidden
                          className="bg-dim absolute inset-x-2 top-1/2 h-px -rotate-12"
                        />
                      )}
                      {!isAvailable && <span className="sr-only"> (unavailable)</span>}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
      </div>

      {/* Availability */}
      <div className="mt-7" aria-live="polite">
        {isSoldOut ? (
          <p className="text-signal text-xs font-semibold tracking-[0.14em] uppercase">
            {variant?.availability === 'archived' ? 'Archive — no longer available' : 'Sold out'}
          </p>
        ) : variant?.availability === 'low_stock' ? (
          <p className="text-bone text-xs tracking-[0.14em] uppercase">Low stock</p>
        ) : null}
      </div>

      <div ref={inlineButtonRef} className="mt-4">
        <Button
          variant="primary"
          size="lg"
          fullWidth
          disabled={isSoldOut || isPending}
          onClick={() => void handleAdd()}
          data-testid="add-to-cart"
        >
          {isSoldOut ? 'Sold out' : isPending ? 'Adding…' : 'Add to cart'}
        </Button>

        {feedback && (
          <p role="status" className="text-smoke mt-3 text-center text-xs">
            {feedback}
          </p>
        )}
      </div>

      {/* Sticky mobile purchase bar */}
      <div
        className={cn(
          'bg-ink/95 border-ash/60 sticky bottom-0 z-30 -mx-[--spacing-gutter] mt-6 border-t px-[--spacing-gutter] py-3 backdrop-blur-sm transition-opacity duration-200 md:hidden',
          isInlineButtonVisible ? 'pointer-events-none opacity-0' : 'opacity-100',
        )}
        aria-hidden={isInlineButtonVisible}
      >
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-paper truncate text-xs font-semibold">{product.name}</p>
            {price && <p className="text-smoke text-xs tabular-nums">{formatMoney(price)}</p>}
          </div>
          <Button
            variant="primary"
            size="md"
            disabled={isSoldOut || isPending || isInlineButtonVisible}
            onClick={() => void handleAdd()}
            className="shrink-0"
          >
            {isSoldOut ? 'Sold out' : 'Add'}
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
