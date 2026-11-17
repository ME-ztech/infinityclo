/**
 * Has the active checkout become an order yet?
 *
 * The confirmation page polls this after the customer pays. It only *reads*:
 * the order is created by the payment provider's signed webhook, never by this
 * route and never by the customer arriving on a "thank you" URL.
 */
import { NextResponse } from 'next/server';

import { getCheckoutByToken, orderForCheckout } from '@/server/commerce/checkout';
import { checkoutToken } from '@/server/commerce/session';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const headers = { 'cache-control': 'private, no-store' };
  const checkout = await getCheckoutByToken(await checkoutToken());
  if (!checkout) return NextResponse.json({ state: 'none' }, { headers });

  const order = await orderForCheckout(checkout.id);
  if (order) {
    return NextResponse.json(
      { state: 'paid', order: { name: order.name, email: order.email, totalCents: order.totalCents, currency: order.currency } },
      { headers },
    );
  }
  return NextResponse.json({ state: checkout.status === 'open' ? 'pending' : checkout.status }, { headers });
}
