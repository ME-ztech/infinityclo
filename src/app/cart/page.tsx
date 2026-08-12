import type { Metadata } from 'next';

import { CartPageView } from '@/components/cart/CartPageView';

export const metadata: Metadata = {
  title: 'Cart',
  description: 'Your INFNITY cart.',
  robots: { index: false, follow: true },
  alternates: { canonical: '/cart' },
};

export default function CartPage() {
  return (
    <div className="edge pt-28 pb-[--spacing-section] md:pt-36">
      <h1 className="font-display text-headline text-paper mb-10">Cart</h1>
      <CartPageView />
    </div>
  );
}
