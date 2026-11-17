import type { Metadata } from 'next';

import { CheckoutComplete } from '@/components/checkout/CheckoutComplete';

export const metadata: Metadata = {
  title: 'Order confirmation',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default function CheckoutCompletePage() {
  return (
    <div className="edge pt-20 pb-(--spacing-section) md:pt-28">
      <CheckoutComplete />
    </div>
  );
}
