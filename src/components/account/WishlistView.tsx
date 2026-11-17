'use client';

import Image from 'next/image';
import Link from 'next/link';

import { ButtonLink } from '@/components/ui/Button';
import { useWishlist } from '@/lib/wishlist/useWishlist';

export interface WishlistCard {
  slug: string;
  name: string;
  price: string | null;
  image: { url: string; alt: string } | null;
  soldOut: boolean;
}

/** Saved pieces, kept in this browser (no account needed). */
export function WishlistView({ catalogue }: { catalogue: readonly WishlistCard[] }) {
  const wishlist = useWishlist();
  if (!wishlist.isHydrated) return <div className="bg-surface-sunken h-40 animate-pulse" aria-busy />;
  const saved = catalogue.filter((item) => wishlist.slugs.includes(item.slug));
  if (saved.length === 0) {
    return (
      <div className="border-line border p-8 text-center">
        <p className="font-display text-2xl">Nothing saved yet</p>
        <p className="text-fg-muted mt-3 text-sm">Tap the heart on any piece to keep it here.</p>
        <div className="mt-6 flex justify-center">
          <ButtonLink href="/shop" variant="primary" size="md">Shop all</ButtonLink>
        </div>
      </div>
    );
  }
  return (
    <ul className="grid grid-cols-2 gap-4 md:grid-cols-3" data-testid="wishlist-items">
      {saved.map((item) => (
        <li key={item.slug}>
          <Link href={`/products/${item.slug}`} className="block">
            <div className="bg-surface-sunken relative aspect-square overflow-hidden">
              {item.image && <Image src={item.image.url} alt={item.image.alt} fill sizes="(min-width: 768px) 25vw, 50vw" className="object-cover" />}
            </div>
            <p className="mt-2 text-sm font-medium">{item.name}</p>
            <p className="text-fg-muted text-sm">{item.soldOut ? 'Sold out' : item.price}</p>
          </Link>
          <button type="button" onClick={() => wishlist.toggle(item.slug)} className="text-fg-muted hover:text-signal mt-1 min-h-11 text-xs underline underline-offset-4">
            Remove
          </button>
        </li>
      ))}
    </ul>
  );
}
