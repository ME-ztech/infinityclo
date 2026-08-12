'use client';

import Image from 'next/image';
import Link from 'next/link';

import { formatMoney, isDiscounted, multiplyMoney } from '@/domain/money';
import type { CartLine } from '@/domain/types';
import { useCart } from '@/lib/cart/CartProvider';
import { MAX_QUANTITY_PER_LINE } from '@/lib/cart/resolve';

export function CartLineRow({ line }: { line: CartLine }) {
  const { updateQuantity, removeLine, isPending } = useCart();

  const lineTotal = multiplyMoney(line.unitPrice, line.quantity);
  const compareTotal = line.compareAtUnitPrice
    ? multiplyMoney(line.compareAtUnitPrice, line.quantity)
    : null;

  return (
    <li className="flex gap-4 py-5" data-testid="cart-line">
      <Link
        href={`/products/${line.productSlug}`}
        className="bg-carbon relative h-28 w-22 shrink-0 overflow-hidden"
        tabIndex={-1}
        aria-hidden
      >
        {line.media && (
          <Image src={line.media.url} alt="" fill sizes="88px" className="object-cover" />
        )}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={`/products/${line.productSlug}`}
              className="text-paper hover:text-bone block truncate text-sm font-semibold"
            >
              {line.productName}
            </Link>
            <p className="text-dim mt-1 text-[0.7rem] tracking-[0.1em] uppercase">
              {line.variantTitle}
            </p>
            {line.availability === 'sold_out' && (
              <p className="text-signal mt-1 text-[0.7rem] font-semibold tracking-[0.1em] uppercase">
                Sold out
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => void removeLine(line.id)}
            disabled={isPending}
            aria-label={`Remove ${line.productName}, ${line.variantTitle}, from cart`}
            data-testid="cart-remove"
            className="text-dim hover:text-paper shrink-0 p-1 disabled:opacity-50"
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path d="m4 4 12 12M16 4 4 16" stroke="currentColor" strokeWidth="1.75" />
            </svg>
          </button>
        </div>

        <div className="mt-auto flex items-end justify-between gap-3 pt-3">
          <div className="border-ash inline-flex items-center border">
            <button
              type="button"
              onClick={() => void updateQuantity(line.id, line.quantity - 1)}
              disabled={isPending}
              aria-label="Decrease quantity"
              data-testid="cart-decrease"
              className="text-bone hover:text-paper hover:bg-carbon flex h-9 w-9 items-center justify-center text-lg leading-none disabled:opacity-50"
            >
              −
            </button>
            <span
              data-testid="cart-quantity"
              aria-live="polite"
              className="w-9 text-center text-sm tabular-nums"
            >
              {line.quantity}
            </span>
            <button
              type="button"
              onClick={() => void updateQuantity(line.id, line.quantity + 1)}
              disabled={isPending || line.quantity >= MAX_QUANTITY_PER_LINE}
              aria-label="Increase quantity"
              data-testid="cart-increase"
              className="text-bone hover:text-paper hover:bg-carbon flex h-9 w-9 items-center justify-center text-lg leading-none disabled:opacity-30"
            >
              +
            </button>
          </div>

          <div className="text-right">
            {compareTotal && isDiscounted(lineTotal, compareTotal) && (
              <p className="text-dim text-xs tabular-nums line-through">
                {formatMoney(compareTotal)}
              </p>
            )}
            <p className="text-paper text-sm font-semibold tabular-nums">
              {formatMoney(lineTotal)}
            </p>
          </div>
        </div>
      </div>
    </li>
  );
}
