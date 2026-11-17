import Image from 'next/image';
import { notFound } from 'next/navigation';

import { ActionForm } from '@/components/admin/ActionForm';
import { AdminPage, Badge, Card, formatCad, formatDate, NotConnected } from '@/components/admin/ui';
import { humanise } from '@/domain/order-status';
import { can } from '@/domain/rbac';
import { requireStaffPage } from '@/server/auth/staff';
import { isAdminConfigured } from '@/server/shopify/config';
import { getOrder, shopifyAdminUrl } from '@/server/shopify/admin';

import { fulfilAction, requestCancelRefundAction, updateNoteAction } from '../actions';

export const metadata = { title: 'Order' };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireStaffPage('orders:read', `/admin/orders/${id}`);
  if (!/^\d+$/.test(id)) notFound();
  if (!isAdminConfigured()) {
    return (
      <AdminPage title="Order">
        <NotConnected
          what="Order details"
          envVar="SHOPIFY_ADMIN_ACCESS_TOKEN"
          scopes="read_orders"
        />
      </AdminPage>
    );
  }
  const order = await getOrder(id);
  if (!order) notFound();
  const role = session.user.role;
  const open = order.fulfillmentOrders.nodes.filter((fo) =>
    fo.supportedActions.some((action) => action.action === 'CREATE_FULFILLMENT'),
  );
  const money = (value: { shopMoney: { amount: string; currencyCode: string } }) =>
    formatCad(value.shopMoney.amount, value.shopMoney.currencyCode);
  return (
    <AdminPage
      title={`Order ${order.name}`}
      description={
        <span className="flex flex-wrap items-center gap-2">
          {formatDate(order.processedAt)} ·{' '}
          <Badge tone="good">{humanise(order.displayFinancialStatus)}</Badge>
          <Badge tone="warn">{humanise(order.displayFulfillmentStatus)}</Badge>
          {order.cancelledAt && <Badge tone="bad">Cancelled {humanise(order.cancelReason)}</Badge>}
          {order.test && <Badge tone="info">Test order</Badge>}
          <a
            className="underline"
            href={shopifyAdminUrl(`orders/${id}`)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open in Shopify admin
          </a>
        </span>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-6">
          <Card title="Items">
            <ul className="divide-line divide-y">
              {order.lineItems.nodes.map((item) => (
                <li key={item.id} className="flex items-center gap-3 py-3 text-sm">
                  <div className="relative h-14 w-14 shrink-0 bg-neutral-100">
                    {item.image && (
                      <Image
                        src={item.image.url.split('?')[0]!}
                        alt=""
                        fill
                        sizes="56px"
                        className="object-cover"
                      />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{item.title}</p>
                    <p className="text-neutral-600">
                      {item.variantTitle} {item.sku && `· ${item.sku}`} · Qty {item.quantity}
                      {item.unfulfilledQuantity > 0 && ` · ${item.unfulfilledQuantity} unfulfilled`}
                    </p>
                  </div>
                  <p className="tabular-nums">{money(item.discountedTotalSet)}</p>
                </li>
              ))}
            </ul>
            <dl className="mt-4 ml-auto grid max-w-xs grid-cols-2 gap-1 text-sm">
              <dt>Subtotal</dt>
              <dd className="text-right">{money(order.subtotalPriceSet)}</dd>
              <dt>
                Discounts {order.discountCodes.length > 0 && `(${order.discountCodes.join(', ')})`}
              </dt>
              <dd className="text-right">−{money(order.totalDiscountsSet)}</dd>
              <dt>Shipping</dt>
              <dd className="text-right">{money(order.totalShippingPriceSet)}</dd>
              <dt>Tax</dt>
              <dd className="text-right">{money(order.totalTaxSet)}</dd>
              <dt className="font-semibold">Total</dt>
              <dd className="text-right font-semibold">{money(order.totalPriceSet)}</dd>
              <dt>Refunded</dt>
              <dd className="text-right">{money(order.totalRefundedSet)}</dd>
            </dl>
          </Card>

          <Card title="Fulfilment">
            {order.fulfillments.length > 0 && (
              <ul className="mb-4 flex flex-col gap-2 text-sm">
                {order.fulfillments.map((fulfillment) => (
                  <li key={fulfillment.id}>
                    {formatDate(fulfillment.createdAt)} —{' '}
                    {humanise(fulfillment.displayStatus ?? fulfillment.status)}{' '}
                    {fulfillment.trackingInfo.map((tracking) => (
                      <span key={tracking.number ?? tracking.url}>
                        · {tracking.company}{' '}
                        {tracking.url ? (
                          <a
                            href={tracking.url}
                            className="underline"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {tracking.number}
                          </a>
                        ) : (
                          tracking.number
                        )}
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            )}
            {open.length > 0 && can(role, 'orders:fulfill') ? (
              <ActionForm
                action={fulfilAction}
                submitLabel="Mark as fulfilled"
                confirm="Mark the remaining items as fulfilled in Shopify?"
              >
                <input type="hidden" name="id" value={id} />
                {open.map((fo) => (
                  <input key={fo.id} type="hidden" name="fulfillmentOrderId" value={fo.id} />
                ))}
                <div className="grid gap-2 md:grid-cols-3">
                  <input
                    name="company"
                    placeholder="Carrier (e.g. Canada Post)"
                    className="border-line h-10 border px-3 text-sm"
                    aria-label="Carrier"
                  />
                  <input
                    name="number"
                    placeholder="Tracking number"
                    className="border-line h-10 border px-3 text-sm"
                    aria-label="Tracking number"
                  />
                  <input
                    name="url"
                    placeholder="Tracking URL (optional)"
                    className="border-line h-10 border px-3 text-sm"
                    aria-label="Tracking URL"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="notify" defaultChecked /> Email the customer
                  (Shopify’s shipping confirmation)
                </label>
              </ActionForm>
            ) : (
              open.length === 0 && (
                <p className="text-sm text-neutral-600">Nothing left to fulfil.</p>
              )
            )}
          </Card>

          <Card title="Timeline">
            <ul className="flex flex-col gap-1 text-sm">
              {order.events.nodes.map((event) => (
                <li key={event.id}>
                  <span className="text-neutral-500">{formatDate(event.createdAt)}</span> —{' '}
                  {event.message
                    .replace(/<[^>]*>/g, '')
                    .replace(/&amp;/g, '&')
                    .replace(/&quot;/g, '"')
                    .replace(/&#39;/g, "'")}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card title="Customer">
            <p className="text-sm">{order.customer?.displayName ?? 'Guest checkout'}</p>
            {order.email && <p className="text-sm text-neutral-600">{order.email}</p>}
            {order.customer && can(role, 'customers:read') && (
              <a
                href={`/admin/customers/${order.customer.id.split('/').pop()}`}
                className="text-sm underline"
              >
                Customer profile
              </a>
            )}
            {order.shippingAddress && (
              <address className="mt-3 text-sm text-neutral-700 not-italic">
                {order.shippingAddress.formatted.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </address>
            )}
          </Card>
          {can(role, 'orders:write') && (
            <Card title="Internal note & tags">
              <ActionForm action={updateNoteAction} submitLabel="Save note">
                <input type="hidden" name="id" value={id} />
                <textarea
                  name="note"
                  defaultValue={order.note ?? ''}
                  rows={4}
                  className="border-line border p-2 text-sm"
                  aria-label="Internal note"
                />
                <input
                  name="tags"
                  defaultValue={order.tags.join(', ')}
                  className="border-line h-10 border px-3 text-sm"
                  aria-label="Tags"
                />
              </ActionForm>
            </Card>
          )}
          {can(role, 'orders:write') && (
            <Card title="Cancel or refund">
              <p className="mb-3 text-xs text-neutral-600">
                Recorded as a request. The owner completes cancellations and refunds in Shopify
                admin, which handles payment reversal, restocking and the customer email. Check the
                refund policy first (10 days, unworn with tags, sale items final).
              </p>
              <ActionForm
                action={requestCancelRefundAction}
                submitLabel="Record request"
                variant="danger"
                confirm="Record this request on the order?"
              >
                <input type="hidden" name="id" value={id} />
                <select
                  name="kind"
                  className="border-line h-10 border px-2 text-sm"
                  aria-label="Request type"
                >
                  <option value="refund">Refund</option>
                  <option value="cancel">Cancellation</option>
                </select>
                <input
                  name="reason"
                  placeholder="Reason (e.g. return received, item unworn)"
                  className="border-line h-10 border px-3 text-sm"
                  aria-label="Reason"
                />
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </AdminPage>
  );
}
