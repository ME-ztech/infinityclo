import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { CheckoutForm } from '@/components/checkout/CheckoutForm';
import { getCheckoutByToken } from '@/server/commerce/checkout';
import { checkoutView } from '@/server/commerce/service';
import { checkoutToken } from '@/server/commerce/session';
import { getDb, schema } from '@/server/db/client';

export const metadata: Metadata = {
  title: 'Checkout',
  robots: { index: false, follow: false },
};

// Per-customer and never cached.
export const dynamic = 'force-dynamic';

export default async function CheckoutPage() {
  const checkout = await getCheckoutByToken(await checkoutToken());
  if (!checkout || checkout.status !== 'open' || checkout.expiresAt <= new Date()) redirect('/cart');

  const db = await getDb();
  const rates = await db.select({ countries: schema.shippingRates.countries, active: schema.shippingRates.active }).from(schema.shippingRates);
  const countries = [...new Set(rates.filter((rate) => rate.active).flatMap((rate) => rate.countries))].sort();

  return (
    <div className="edge pt-14 pb-(--spacing-section) md:pt-20">
      <h1 className="font-display text-headline text-fg mb-12 text-center">Checkout</h1>
      <CheckoutForm initial={await checkoutView(checkout)} countries={countries} />
    </div>
  );
}
