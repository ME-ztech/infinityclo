'use client';

/**
 * Quick add.
 *
 * A bottom sheet on a phone and a centred panel on a desktop — the same
 * component, because the *content* is identical and only the entry differs. A
 * sheet that rises from the thumb is the native gesture on mobile; a panel that
 * drops into the middle of the viewport is the desktop equivalent.
 *
 * It deliberately does not skip size selection. "Add to bag" without a size is
 * how a customer ends up returning a garment, so the sheet is a *shortcut to the
 * size selector*, not a shortcut past it. The product's own options drive the
 * sheet, so a piece with a colour axis gets both rows rather than a silent
 * default.
 *
 * Unreachable sizes are struck through rather than hidden, for the same reason
 * as on the product page: a customer looking for a sold-out size needs to see
 * that it exists and is gone, not wonder whether the brand makes it at all.
 */
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { MediaFrame } from '@/components/ui/MediaFrame';
import { discountPercent, formatMoney, isDiscounted } from '@/domain/money';
import { findVariant, isOptionValueAvailable, isSizeOption, primaryMedia } from '@/domain/product';
import type { Product } from '@/domain/types';
import { useCart } from '@/lib/cart/CartProvider';
import { cn } from '@/lib/cn';
import { track } from '@/lib/analytics';
import { useFocusTrap } from '@/lib/useFocusTrap';

export function QuickAddSheet({ product, onClose }: { product: Product; onClose: () => void }) {
  const { addLine, isPending } = useCart();
  const containerRef = useFocusTrap(true, onClose);

  /**
   * Nothing is pre-selected on the size axis. The whole purpose of this sheet is
   * to make the customer choose one, and a pre-filled size is a size chosen for
   * them. Non-size axes (colour) *are* seeded, because those have a defensible
   * default: whichever the card was already showing.
   */
  const [selections, setSelections] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const option of product.options) {
      if (isSizeOption(option.name)) continue;
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

  const [error, setError] = useState<string | null>(null);

  const isComplete = product.options.every((option) => Boolean(selections[option.name]));
  const variant = useMemo(
    () => (isComplete ? findVariant(product, selections) : null),
    [isComplete, product, selections],
  );

  const media = primaryMedia(product);
  const price = variant?.price ?? null;
  const compareAt = variant?.compareAtPrice ?? null;
  const onSale = price && compareAt ? isDiscounted(price, compareAt) : false;

  async function handleAdd() {
    if (!isComplete) {
      const missing = product.options.find((option) => !selections[option.name]);
      setError(`Choose a ${missing?.name.toLowerCase() ?? 'size'}`);
      return;
    }
    if (!variant || variant.availability === 'sold_out') {
      setError('That combination is sold out');
      return;
    }

    await addLine({
      productSlug: product.slug,
      variantId: variant.id,
      quantity: 1,
      productName: product.name,
    });
    track({ name: 'quick_add_opened', productSlug: product.slug });
    // The cart drawer opens on add, so the sheet closing is what hands the
    // customer straight to it instead of stacking two panels.
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[90]" data-testid="quick-add">
      <button
        type="button"
        aria-label="Close quick add"
        onClick={onClose}
        className="bg-void/60 absolute inset-0 h-full w-full animate-[fade-in_200ms_ease-out] cursor-default"
        tabIndex={-1}
      />

      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Quick add — ${product.name}`}
        tabIndex={-1}
        data-surface="paper"
        className={cn(
          'bg-surface text-fg absolute inset-x-0 bottom-0 max-h-[86svh] overflow-y-auto',
          'animate-[rise_320ms_var(--ease-brand)_both]',
          'sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-[min(30rem,calc(100vw-3rem))] sm:-translate-x-1/2 sm:-translate-y-1/2',
        )}
      >
        {/* Grab handle. Purely an affordance cue on mobile; hidden on desktop
            where the panel is not draggable. */}
        <div aria-hidden className="flex justify-center pt-3 pb-1 sm:hidden">
          <span className="bg-line h-1 w-10 rounded-full" />
        </div>

        <div className="flex items-start gap-4 p-5 pb-0 sm:p-6 sm:pb-0">
          <div className="w-20 shrink-0">
            <MediaFrame
              src={media?.url}
              alt=""
              sizes="80px"
              fallbackLabel={product.name}
              ratioClassName="aspect-(--aspect-portrait)"
            />
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="text-fg text-sm leading-snug font-semibold text-pretty">
              {product.name}
            </h2>
            {price && (
              <p className="mt-2 flex flex-wrap items-baseline gap-2">
                <span
                  className={cn(
                    'text-sm tabular-nums',
                    onSale ? 'text-signal font-semibold' : 'text-fg',
                  )}
                >
                  {formatMoney(price)}
                </span>
                {onSale && compareAt && (
                  <>
                    <span className="text-fg-faint text-xs tabular-nums line-through">
                      {formatMoney(compareAt)}
                    </span>
                    <span className="bg-signal text-paper px-1.5 py-0.5 text-[0.56rem] font-bold tracking-[0.14em] uppercase tabular-nums">
                      −{discountPercent(price, compareAt)}%
                    </span>
                  </>
                )}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close quick add"
            className="text-fg-faint hover:text-fg -mt-1 -mr-2 p-3"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path d="m4 4 12 12M16 4 4 16" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-6 p-5 sm:p-6">
          {product.options.map((option) => (
            <fieldset key={option.id}>
              <legend className="text-fg-faint mb-3 text-[0.64rem] font-semibold tracking-[0.22em] uppercase">
                {option.name}
              </legend>
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
                      onClick={() => {
                        setSelections((current) => ({ ...current, [option.name]: value }));
                        setError(null);
                      }}
                      aria-pressed={isSelected}
                      className={cn(
                        'relative h-12 min-w-14 border px-4 text-[0.72rem] font-semibold tracking-[0.1em] uppercase transition-colors duration-150',
                        isSelected
                          ? 'border-ink bg-ink text-paper'
                          : 'border-line text-fg hover:border-fg',
                        !isAvailable && 'text-fg-faint border-line/60',
                      )}
                    >
                      {value}
                      {!isAvailable && (
                        <>
                          <span
                            aria-hidden
                            className="bg-fg-faint absolute inset-x-2 top-1/2 h-px -rotate-12"
                          />
                          <span className="sr-only"> (unavailable)</span>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}

          <div aria-live="polite">
            {error && <p className="text-signal mb-3 text-xs font-semibold">{error}</p>}
          </div>

          <Button
            variant="primary"
            size="lg"
            fullWidth
            disabled={isPending}
            onClick={() => void handleAdd()}
            data-testid="quick-add-confirm"
          >
            {isPending ? 'Adding…' : 'Add to bag'}
          </Button>
        </div>
      </div>
    </div>
  );
}
