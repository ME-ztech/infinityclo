import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AccountLayout, SignInPrompt } from '@/components/account/AccountShell';
import { ButtonLink } from '@/components/ui/Button';
import { deliveryProgress, humanise, ORDER_STATE_LABELS, orderState } from '@/domain/order-status';
import { cn } from '@/lib/cn';
import { accountState, formatShopifyMoney, loadOrder } from '@/server/account';

export const metadata: Metadata = { title: 'Order', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,20}$/.test(id)) notFound();
  const state = await accountState(`/account/orders/${id}`);
  if (state.kind === 'not_configured') notFound();
  if (state.kind === 'signed_out') {
    return (
      <AccountLayout title="Order" signedIn={false}>
        <SignInPrompt returnTo={`/account/orders/${id}`} />
      </AccountLayout>
    );
  }
  // Token-scoped: another customer's order id simply returns null here.
  const order = await loadOrder(state.accessToken, id);
  if (!order) notFound();

  const status = orderState({
    financialStatus: order.financialStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    cancelledAt: order.cancelledAt,
    fulfillments: order.fulfillments.nodes.map((f) => ({
      status: f.status,
      latestShipmentStatus: f.latestShipmentStatus,
      trackingNumbers: f.trackingInformation.map((t) => t.number ?? '').filter(Boolean),
    })),
  });
  const progress = deliveryProgress(status);

  return (
    <AccountLayout title={`Order ${order.name}`} signedIn>
      <p className="text-fg-muted text-sm">
        Placed {new Date(order.processedAt).toLocaleDateString('en-CA', { dateStyle: 'long' })} ·
        Payment {humanise(order.financialStatus)}
      </p>
      <p className="font-display mt-4 text-2xl" data-testid="order-status">
        {ORDER_STATE_LABELS[status]}
      </p>

      {progress && (
        <ol className="mt-6 grid grid-cols-5 gap-1" aria-label="Delivery progress">
          {progress.map((step) => (
            <li key={step.key} className="text-center">
              <span
                className={cn('block h-1.5', step.state === 'upcoming' ? 'bg-line' : 'bg-fg')}
              />
              <span
                className={cn(
                  'mt-2 block text-[0.65rem] leading-tight uppercase',
                  step.state === 'upcoming' ? 'text-fg-faint' : 'text-fg font-semibold',
                )}
              >
                {step.label}
                {step.state === 'current' && <span className="sr-only"> (current)</span>}
              </span>
            </li>
          ))}
        </ol>
      )}

      {order.fulfillments.nodes.length > 0 && (
        <section className="mt-10" aria-labelledby="shipments-heading">
          <h2
            id="shipments-heading"
            className="text-fg-faint text-[0.66rem] font-semibold tracking-[0.24em] uppercase"
          >
            Shipments
          </h2>
          <ul className="mt-4 flex flex-col gap-4">
            {order.fulfillments.nodes.map((fulfillment) => (
              <li key={fulfillment.id} className="border-line border p-4 text-sm">
                <p>Shipment {humanise(fulfillment.latestShipmentStatus ?? fulfillment.status)}</p>
                {fulfillment.trackingInformation.map((tracking) => (
                  <p key={tracking.number ?? tracking.url} className="text-fg-muted mt-1">
                    {tracking.company ?? 'Carrier'} · {tracking.number ?? 'No tracking number'}{' '}
                    {tracking.url && (
                      <a
                        href={tracking.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-fg underline underline-offset-4"
                      >
                        Track
                      </a>
                    )}
                  </p>
                ))}
                {fulfillment.estimatedDeliveryAt && (
                  <p className="text-fg-muted mt-1">
                    Carrier estimate:{' '}
                    {new Date(fulfillment.estimatedDeliveryAt).toLocaleDateString('en-CA', {
                      dateStyle: 'medium',
                    })}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10" aria-labelledby="items-heading">
        <h2
          id="items-heading"
          className="text-fg-faint text-[0.66rem] font-semibold tracking-[0.24em] uppercase"
        >
          Items
        </h2>
        <ul className="divide-line border-line mt-4 divide-y border-y">
          {order.lineItems.nodes.map((item) => (
            <li key={item.id} className="flex items-center gap-4 py-4">
              <div className="bg-surface-sunken relative h-20 w-16 shrink-0 overflow-hidden">
                {item.image && (
                  <Image
                    src={item.image.url}
                    alt={item.image.altText ?? item.title}
                    fill
                    sizes="64px"
                    className="object-cover"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">{item.title}</p>
                {item.variantTitle && <p className="text-fg-muted">{item.variantTitle}</p>}
                <p className="text-fg-muted">Qty {item.quantity}</p>
              </div>
              <p className="text-sm tabular-nums">{formatShopifyMoney(item.totalPrice)}</p>
            </li>
          ))}
        </ul>
        <dl className="mt-4 ml-auto flex max-w-xs flex-col gap-1 text-sm">
          {(
            [
              ['Subtotal', order.subtotal],
              ['Shipping', order.totalShipping],
              ['Tax', order.totalTax],
              [
                'Refunded',
                order.totalRefunded && Number(order.totalRefunded.amount) > 0
                  ? order.totalRefunded
                  : null,
              ],
            ] as const
          ).map(([label, value]) =>
            value ? (
              <div key={label} className="flex justify-between">
                <dt className="text-fg-muted">{label}</dt>
                <dd className="tabular-nums">{formatShopifyMoney(value)}</dd>
              </div>
            ) : null,
          )}
          <div className="border-line mt-1 flex justify-between border-t pt-2 font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatShopifyMoney(order.totalPrice)}</dd>
          </div>
        </dl>
      </section>

      <div className="mt-10 flex flex-wrap gap-3">
        <ButtonLink
          href={`/contact?topic=return&order=${encodeURIComponent(order.name)}`}
          variant="secondary"
          size="md"
        >
          Request a return or exchange
        </ButtonLink>
        <ButtonLink
          href={`/contact?topic=order_help&order=${encodeURIComponent(order.name)}`}
          variant="secondary"
          size="md"
        >
          Get help with this order
        </ButtonLink>
        {order.statusPageUrl && (
          <Link
            href={order.statusPageUrl}
            className="text-fg-muted flex min-h-12 items-center text-sm underline underline-offset-4"
          >
            Shopify order status page
          </Link>
        )}
      </div>
    </AccountLayout>
  );
}
