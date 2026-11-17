import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AccountShell, Unavailable } from '@/components/account/AccountShell';
import { formatAmount, formatDate, GuestAccount } from '@/components/account/GuestAccount';
import { accountContext, loadForPage } from '@/server/customer/context';
import {
  financialLabel,
  fulfillmentLabel,
  orderProgress,
  safeTrackingUrl,
  shipmentLabel,
} from '@/server/customer/order-status';

export const metadata: Metadata = { title: 'Order' };

/**
 * Order detail.
 *
 * The order is requested from Shopify by id *through this customer's token*.
 * An id that belongs to someone else comes back as nothing and renders as a
 * plain 404, indistinguishable from an id that does not exist.
 *
 * Every figure on this page is Shopify's: nothing is recalculated here.
 */
export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const page = `/account/orders/${/^\d{1,20}$/.test(id) ? id : ''}`;
  const context = await accountContext(page);
  if (context.state !== 'signed_in') return <GuestAccount title="Order" current="/account/orders" context={context} />;
  if (!/^\d{1,20}$/.test(id)) notFound();

  const loaded = await loadForPage(page, () => context.gateway.getOrder(context.session.accessToken, id));
  if ('error' in loaded) {
    return (
      <AccountShell title="Order" current="/account/orders" signedIn>
        <Unavailable message={loaded.error} />
      </AccountShell>
    );
  }
  const order = loaded.data;
  if (!order) notFound();

  const progress = orderProgress(order);
  const refunded = order.refunded && Number(order.refunded.amount) > 0 ? order.refunded : null;

  return (
    <AccountShell title={`Order ${order.name}`} current="/account/orders" signedIn>
      <Link href="/account/orders" className="text-fg-muted hover:text-fg text-xs font-semibold uppercase tracking-[0.16em]">
        ← All orders
      </Link>

      <section className="border-line mt-6 border p-6 md:p-8" aria-labelledby="order-status">
        <h2 id="order-status" className="font-display text-fg text-2xl" data-testid="order-progress">
          {progress.label}
        </h2>
        <p className="text-fg-muted mt-2 text-sm leading-relaxed">{progress.detail}</p>
        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 text-sm md:grid-cols-3">
          <div>
            <dt className="text-fg-muted text-xs uppercase tracking-[0.14em]">Placed</dt>
            <dd className="text-fg mt-1">{formatDate(order.processedAt, true)}</dd>
          </div>
          <div>
            <dt className="text-fg-muted text-xs uppercase tracking-[0.14em]">Payment</dt>
            <dd className="text-fg mt-1">{financialLabel(order.financialStatus)}</dd>
          </div>
          <div>
            <dt className="text-fg-muted text-xs uppercase tracking-[0.14em]">Fulfilment</dt>
            <dd className="text-fg mt-1">{order.cancelledAt ? 'Cancelled' : fulfillmentLabel(order.fulfillmentStatus)}</dd>
          </div>
        </dl>
      </section>

      {order.fulfillments.length > 0 && (
        <section className="mt-8" aria-labelledby="order-shipments">
          <h2 id="order-shipments" className="font-display text-fg mb-4 text-xl">
            Shipments
          </h2>
          <ul className="space-y-4">
            {order.fulfillments.map((fulfillment, index) => {
              const tracking = fulfillment.tracking.filter((entry) => entry.number || entry.url);
              const status = shipmentLabel(fulfillment.latestShipmentStatus);
              return (
                <li key={fulfillment.id} className="border-line border p-5 text-sm">
                  <p className="text-fg font-semibold">
                    Shipment {index + 1}
                    <span className="text-fg-muted font-normal"> · sent {formatDate(fulfillment.createdAt)}</span>
                  </p>
                  {status && <p className="text-fg mt-2">Carrier status: {status}</p>}
                  {fulfillment.estimatedDeliveryAt && (
                    <p className="text-fg-muted mt-1">Carrier estimate: {formatDate(fulfillment.estimatedDeliveryAt)}</p>
                  )}
                  {tracking.length === 0 ? (
                    <p className="text-fg-muted mt-2">No tracking number was provided for this shipment.</p>
                  ) : (
                    <ul className="mt-2 space-y-1">
                      {tracking.map((entry, trackingIndex) => {
                        const url = safeTrackingUrl(entry.url);
                        const label = [entry.company, entry.number].filter(Boolean).join(' · ') || 'Track shipment';
                        return (
                          <li key={trackingIndex}>
                            {url ? (
                              <a href={url} target="_blank" rel="noopener noreferrer" className="text-fg underline underline-offset-4">
                                {label}
                                <span className="sr-only"> (opens the carrier’s site in a new tab)</span>
                              </a>
                            ) : (
                              <span className="text-fg">{label}</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {fulfillment.events.length > 0 && (
                    <ol className="text-fg-muted border-line mt-4 space-y-1 border-t pt-3 text-xs">
                      {[...fulfillment.events]
                        .sort((a, b) => b.happenedAt.localeCompare(a.happenedAt))
                        .map((event, eventIndex) => (
                          <li key={eventIndex}>
                            {formatDate(event.happenedAt, true)} — {shipmentLabel(event.status)}
                          </li>
                        ))}
                    </ol>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="mt-8" aria-labelledby="order-items">
        <h2 id="order-items" className="font-display text-fg mb-4 text-xl">
          Items
        </h2>
        <ul className="border-line divide-line divide-y border">
          {order.lineItems.map((item) => (
            <li key={item.id} className="flex gap-4 p-5 text-sm">
              {item.image && (
                // Order images come from Shopify's CDN at a fixed small size; no optimiser round-trip needed.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.image.url} alt={item.image.alt} width={64} height={64} loading="lazy" className="bg-surface-sunken h-16 w-16 shrink-0 object-cover" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-fg font-semibold">{item.title}</p>
                {item.variantTitle && <p className="text-fg-muted mt-1">{item.variantTitle}</p>}
                <p className="text-fg-muted mt-1">
                  Qty {item.quantity}
                  {item.unitPrice && <> · {formatAmount(item.unitPrice)} each</>}
                </p>
                {item.totalDiscount && <p className="text-fg-muted mt-1">Discount −{formatAmount(item.totalDiscount)}</p>}
              </div>
              <p className="text-fg shrink-0">{formatAmount(item.total)}</p>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <section className="border-line border p-6 text-sm" aria-labelledby="order-totals">
          <h2 id="order-totals" className="font-display text-fg mb-4 text-xl">
            Totals
          </h2>
          <dl className="space-y-2">
            <div className="flex justify-between gap-4">
              <dt className="text-fg-muted">Subtotal</dt>
              <dd className="text-fg">{formatAmount(order.subtotal)}</dd>
            </div>
            {order.discounts.map((discount, index) => (
              <div key={index} className="flex justify-between gap-4">
                <dt className="text-fg-muted">Discount ({discount.label})</dt>
                <dd className="text-fg">
                  {discount.amount ? `−${formatAmount(discount.amount)}` : discount.percentage !== null ? `${discount.percentage}% off` : 'Applied'}
                </dd>
              </div>
            ))}
            <div className="flex justify-between gap-4">
              <dt className="text-fg-muted">Shipping</dt>
              <dd className="text-fg">{formatAmount(order.shipping)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-fg-muted">Tax</dt>
              <dd className="text-fg">{formatAmount(order.tax)}</dd>
            </div>
            <div className="border-line flex justify-between gap-4 border-t pt-3 font-semibold">
              <dt className="text-fg">Total</dt>
              <dd className="text-fg" data-testid="order-total">{formatAmount(order.total)}</dd>
            </div>
            {refunded && (
              <div className="flex justify-between gap-4">
                <dt className="text-fg-muted">Refunded</dt>
                <dd className="text-fg">−{formatAmount(refunded)}</dd>
              </div>
            )}
          </dl>
        </section>

        <section className="border-line border p-6 text-sm" aria-labelledby="order-address">
          <h2 id="order-address" className="font-display text-fg mb-4 text-xl">
            Shipping to
          </h2>
          {order.shippingAddress.length > 0 ? (
            <address className="text-fg-muted not-italic leading-relaxed">
              {order.shippingAddress.map((line, index) => (
                <span key={index} className="block">
                  {line}
                </span>
              ))}
            </address>
          ) : (
            <p className="text-fg-muted">No shipping address on this order.</p>
          )}
          <Link href={`/account/help?order=${order.id}`} className="text-fg mt-6 inline-block text-xs font-semibold uppercase tracking-[0.16em] underline underline-offset-4">
            Need help with this order?
          </Link>
        </section>
      </div>
    </AccountShell>
  );
}
