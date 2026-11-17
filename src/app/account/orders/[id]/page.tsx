import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AccountShell } from '@/components/account/AccountShell';
import { orderProgress } from '@/domain/order-progress';
import { getOrderForCustomer } from '@/server/commerce/orders';
import { requireCustomerPage } from '@/server/commerce/session';

export const metadata: Metadata = { title: 'Order', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency }).format(cents / 100);

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customer = await requireCustomerPage(`/account/orders/${id}`);
  // Looked up by order id AND this customer's id: someone else's order is a 404.
  const detail = await getOrderForCustomer(customer.id, id);
  if (!detail) notFound();

  const { order, items, fulfillments } = detail;
  const progress = orderProgress({
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    cancelled: order.cancelledAt !== null,
    shipments: fulfillments,
  });
  const address = order.shippingAddress;

  return (
    <AccountShell title={`Order ${order.name}`} current="/account/orders" signedIn>
      <div data-testid="order-detail">
        <p className="text-fg-muted text-sm">
          Placed {order.placedAt.toLocaleDateString('en-CA', { dateStyle: 'long' })}
        </p>
        <p className="font-display text-fg mt-2 text-2xl" data-testid="order-status">
          {progress.label}
        </p>

        {!progress.cancelled && (
          <ol className="mt-8 grid gap-3 sm:grid-cols-4" aria-label="Order progress">
            {progress.steps.map((step) => (
              <li
                key={step.id}
                aria-current={step.reached ? 'step' : undefined}
                className={`border-t-2 pt-3 text-[0.72rem] font-semibold tracking-[0.14em] uppercase ${
                  step.reached ? 'border-fg text-fg' : 'border-line text-fg-faint'
                }`}
              >
                {step.label}
                <span className="sr-only">{step.reached ? ' — done' : ' — not yet'}</span>
              </li>
            ))}
          </ol>
        )}

        {fulfillments.length > 0 && (
          <section className="mt-10" aria-labelledby="shipments-heading">
            <h2 id="shipments-heading" className="text-fg-muted mb-4 text-[0.68rem] font-semibold tracking-[0.16em] uppercase">
              Shipments
            </h2>
            <ul className="space-y-3">
              {fulfillments.map((shipment) => (
                <li key={shipment.id} className="border-line border p-4 text-sm" data-testid="order-shipment">
                  <p className="text-fg">
                    Shipped {shipment.shippedAt.toLocaleDateString('en-CA', { dateStyle: 'medium' })}
                    {shipment.deliveredAt &&
                      ` · Delivered ${shipment.deliveredAt.toLocaleDateString('en-CA', { dateStyle: 'medium' })}`}
                  </p>
                  {shipment.trackingNumber ? (
                    <p className="text-fg-muted mt-1">
                      {shipment.trackingCompany ?? 'Tracking'}:{' '}
                      {shipment.trackingUrl ? (
                        <a href={shipment.trackingUrl} rel="noopener noreferrer" target="_blank" className="text-fg underline underline-offset-4">
                          {shipment.trackingNumber}
                        </a>
                      ) : (
                        <span className="text-fg">{shipment.trackingNumber}</span>
                      )}
                    </p>
                  ) : (
                    <p className="text-fg-muted mt-1">No tracking number was provided for this shipment.</p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-10" aria-labelledby="items-heading">
          <h2 id="items-heading" className="text-fg-muted mb-4 text-[0.68rem] font-semibold tracking-[0.16em] uppercase">
            Items
          </h2>
          <ul className="divide-line border-line divide-y border-y">
            {items.map((item) => (
              <li key={item.id} className="flex gap-4 py-4">
                {item.imageUrl && (
                  <Image src={item.imageUrl} alt="" width={64} height={80} className="h-20 w-16 flex-none object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-fg text-sm font-semibold">{item.title}</p>
                  <p className="text-fg-muted text-xs">
                    {item.variantTitle && `${item.variantTitle} · `}Qty {item.quantity} · {money(item.unitPriceCents, order.currency)} each
                  </p>
                  {item.discountCents > 0 && (
                    <p className="text-fg-muted text-xs">Discount −{money(item.discountCents, order.currency)}</p>
                  )}
                </div>
                <p className="text-fg text-sm">{money(item.totalCents, order.currency)}</p>
              </li>
            ))}
          </ul>
        </section>

        <div className="mt-10 grid gap-10 md:grid-cols-2">
          <section aria-labelledby="totals-heading">
            <h2 id="totals-heading" className="text-fg-muted mb-4 text-[0.68rem] font-semibold tracking-[0.16em] uppercase">
              Payment
            </h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-fg-muted">Subtotal</dt>
                <dd>{money(order.subtotalCents, order.currency)}</dd>
              </div>
              {order.discountCents > 0 && (
                <div className="flex justify-between">
                  <dt className="text-fg-muted">Discount{order.discountCode ? ` (${order.discountCode})` : ''}</dt>
                  <dd>−{money(order.discountCents, order.currency)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-fg-muted">Shipping{order.shippingName ? ` (${order.shippingName})` : ''}</dt>
                <dd>{money(order.shippingCents, order.currency)}</dd>
              </div>
              {order.taxLines.map((tax) => (
                <div key={tax.name} className="flex justify-between">
                  <dt className="text-fg-muted">{tax.name}</dt>
                  <dd>{money(tax.amountCents, order.currency)}</dd>
                </div>
              ))}
              <div className="border-line text-fg flex justify-between border-t pt-3 font-semibold">
                <dt>Total</dt>
                <dd data-testid="order-total">{money(order.totalCents, order.currency)}</dd>
              </div>
              {order.refundedCents > 0 && (
                <div className="flex justify-between">
                  <dt className="text-fg-muted">Refunded</dt>
                  <dd>−{money(order.refundedCents, order.currency)}</dd>
                </div>
              )}
            </dl>
          </section>

          {address && (
            <section aria-labelledby="address-heading">
              <h2 id="address-heading" className="text-fg-muted mb-4 text-[0.68rem] font-semibold tracking-[0.16em] uppercase">
                Shipping to
              </h2>
              <address className="text-fg text-sm leading-relaxed not-italic">
                {address.firstName} {address.lastName}
                <br />
                {address.line1}
                {address.line2 && (
                  <>
                    <br />
                    {address.line2}
                  </>
                )}
                <br />
                {address.city} {address.province} {address.postalCode}
                <br />
                {address.country}
              </address>
            </section>
          )}
        </div>

        <p className="mt-10 text-sm">
          <Link href={`/account/help?order=${order.id}`} className="text-fg underline underline-offset-4">
            Need help with this order?
          </Link>
        </p>
      </div>
    </AccountShell>
  );
}
