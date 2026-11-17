import type { Metadata } from 'next';

import { AccountLayout } from '@/components/account/AccountShell';
import { WishlistView } from '@/components/account/WishlistView';
import { catalogRepository } from '@/data';
import { formatMoney } from '@/domain/money';
import { fromPrice, isSoldOut, primaryMedia } from '@/domain/product';
import { getCustomerSession } from '@/server/auth/customer';

export const metadata: Metadata = { title: 'Wishlist', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function WishlistPage() {
  const [{ products }, session] = await Promise.all([catalogRepository.listProducts(), getCustomerSession()]);
  const catalogue = products.map((product) => {
    const price = fromPrice(product);
    const media = primaryMedia(product);
    return {
      slug: product.slug,
      name: product.name,
      price: price ? formatMoney(price) : null,
      image: media ? { url: media.url, alt: media.alt } : null,
      soldOut: isSoldOut(product),
    };
  });
  return (
    <AccountLayout title="Wishlist" signedIn={Boolean(session)}>
      <WishlistView catalogue={catalogue} />
    </AccountLayout>
  );
}
