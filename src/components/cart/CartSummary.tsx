'use client';

import Image from 'next/image';
import Link from 'next/link';

import { formatMoney, money } from '@/domain/money';
import type { Cart } from '@/domain/types';
import { useCart } from '@/lib/cart/CartProvider';
import { useStoreConfig } from '@/lib/store-config';

import { CheckoutAction } from './CheckoutAction';

/**
 * Subtotal, live offers and checkout — shared by the drawer and the cart page.
 *
 * Offer savings are labelled as estimates: only promotions that exist as real
 * Shopify discounts are shown, and Shopify's checkout computes the final
 * discount, shipping and tax. Nothing here pretends to be the total.
 */
export function CartSummary({ cart, onNavigate }: { cart: Cart; onNavigate?: () => void }) {
  const { extras, isPending } = useCart();
  const { cartUpsellEnabled } = useStoreConfig();

  return (
    <div>
      {extras.offers.length > 0 && (
        <ul className="mb-4 flex flex-col gap-2" data-testid="cart-offers">
          {extras.offers.map((offer) => (
            <li
              key={offer.promotionId}
              className="bg-surface-sunken text-fg px-3 py-2 text-xs leading-snug"
            >
              <span className="font-semibold">{offer.title}:</span> {offer.message}
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold tracking-[0.16em] uppercase">Subtotal</span>
        <span data-testid="cart-subtotal" className="font-display text-fg text-2xl tabular-nums">
          {formatMoney(cart.subtotal)}
        </span>
      </div>
      {extras.estimatedSavingCents > 0 && (
        <div
          className="mt-1 flex items-baseline justify-between text-sm"
          data-testid="cart-estimated-saving"
        >
          <span className="text-fg-muted">Estimated offer saving</span>
          <span className="text-signal font-semibold tabular-nums">
            −{formatMoney(money(extras.estimatedSavingCents, cart.currency))}
          </span>
        </div>
      )}
      <p className="text-fg-faint mt-2 text-[0.7rem] leading-relaxed">
        {extras.estimatedSavingCents > 0 ? 'Offers are applied and confirmed at checkout. ' : ''}
        Shipping and taxes are calculated at checkout.
      </p>

      <div className="mt-5">
        <CheckoutAction cart={cart} disabled={isPending} />
      </div>

      {cartUpsellEnabled && extras.upsell.length > 0 && (
        <div className="border-line mt-6 border-t pt-5" data-testid="cart-upsell">
          <p className="text-fg-faint mb-3 text-[0.66rem] font-semibold tracking-[0.24em] uppercase">
            You may also like
          </p>
          <ul className="grid grid-cols-3 gap-2">
            {extras.upsell.map((item) => (
              <li key={item.slug}>
                <Link href={`/products/${item.slug}`} onClick={onNavigate} className="group block">
                  <div className="bg-surface-sunken relative aspect-square overflow-hidden">
                    {item.image && (
                      <Image
                        src={item.image.url}
                        alt={item.image.alt}
                        fill
                        sizes="120px"
                        className="object-cover"
                      />
                    )}
                  </div>
                  <p className="text-fg mt-1.5 line-clamp-2 text-[0.68rem] leading-tight">
                    {item.name}
                  </p>
                  {item.price && (
                    <p className="text-fg-muted text-[0.68rem] tabular-nums">
                      {formatMoney(item.price)}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
