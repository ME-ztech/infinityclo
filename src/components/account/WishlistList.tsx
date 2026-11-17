'use client';

/**
 * The saved list.
 *
 * The wishlist is stored in this browser (localStorage), not on an account, so
 * it works for guests and signed-in customers alike and says so. It lists the
 * saved product slugs as links; price and stock are deliberately not shown here
 * because the product page is the live source for both.
 */
import Link from 'next/link';

import { ButtonLink } from '@/components/ui/Button';
import { useWishlist } from '@/lib/wishlist/useWishlist';

const titleFromSlug = (slug: string): string =>
  slug
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

export function WishlistList() {
  const { slugs, isHydrated, toggle } = useWishlist();

  if (!isHydrated) {
    return (
      <p className="border-line text-fg-muted border p-6 text-sm" aria-live="polite">
        Loading your saved pieces…
      </p>
    );
  }

  if (slugs.length === 0) {
    return (
      <div className="border-line border p-8 text-center md:p-12" data-testid="wishlist-empty">
        <p className="font-display text-fg text-2xl">Nothing saved yet</p>
        <p className="text-fg-muted mx-auto mt-4 max-w-md text-sm leading-relaxed">
          Tap the heart on any piece to save it here. Your list is kept on this device.
        </p>
        <div className="mt-8">
          <ButtonLink href="/shop" variant="primary" size="md">
            Shop all
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <>
      <ul className="border-line divide-line divide-y border" data-testid="wishlist-list">
        {slugs.map((slug) => (
          <li key={slug} className="flex items-center justify-between gap-4 p-5 text-sm">
            <Link href={`/products/${slug}`} className="text-fg font-semibold underline-offset-4 hover:underline">
              {titleFromSlug(slug)}
            </Link>
            <button
              type="button"
              onClick={() => toggle(slug)}
              className="text-fg-muted hover:text-fg shrink-0 cursor-pointer text-xs font-semibold uppercase tracking-[0.16em]"
            >
              Remove<span className="sr-only"> {titleFromSlug(slug)} from your wishlist</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="text-fg-muted mt-4 text-xs">Your wishlist is kept on this device and is not shared with your account.</p>
    </>
  );
}
