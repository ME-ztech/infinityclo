import { randomUUID } from 'node:crypto';

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { fulfillOrderAction, saveOrderNoteAction } from '@/app/admin/actions/commerce';
import { cancelOrderAction, markDeliveredAction, refundOrderAction } from '@/app/admin/actions/orders';
import { OrderStatusBadges } from '@/components/admin/OrderStatus';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmField,
  Disconnected,
  Flash,
  LinkButton,
  PageHeader,
  TableWrap,
  TextArea,
  TextField,
  formatDate,
  formatMoney,
  td,
  th,
} from '@/components/admin/ui';
import { REQUIRED_ADMIN_SCOPES, cents, getGateway } from '@/server/admin/gateway';
import { requirePage, type SearchParams } from '@/server/admin/page';
import { can } from '@/server/admin/permissions';
import { listOrderNotes } from '@/server/admin/settings';

export const metadata: Metadata = { title: 'Order' };

const NOTE_LABEL = {
  note: 'Note',
  fulfilment: 'Fulfilment',
  cancel_request: 'Cancellation request',
  refund_request: 'Refund request',
  refund: 'Refund',
  cancel: 'Cancellation',
  delivered: 'Delivery',
} as const;

export default async function AdminOrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const session = await requirePage('orders.view');
  const { id } = await params;
  const query = await searchParams;
  const gateway = await getGateway();

  if (!gateway) {
    return (
      <>
        <PageHeader title="Order" actions={<LinkButton href="/admin/orders">Back to orders</LinkButton>} />
        <Disconnected module="Orders" scopes={REQUIRED_ADMIN_SCOPES} />
      </>
    );
  }

  const order = await gateway.getOrder(id);
  if (!order) notFound();
  const notes = await listOrderNotes(id);

  const canEdit = can(session.role, 'orders.edit');
  const canRefund = can(session.role, 'orders.refund');
  const refundable = Math.max(0, order.total.amount - order.refunded.amount);
  const paid = order.status.payment === 'paid' || order.status.payment === 'partially_refunded';
  const canFulfil = canEdit && order.openFulfillmentOrderIds.length > 0 && !order.cancelledAt;
  const shipped = order.fulfillments.length > 0;
  // Minted per render: resubmitting this exact form cannot refund a second time.
  const refundKey = randomUUID();

  return (
    <>
      <PageHeader
        title={`Order ${order.name}`}
        description={
          <>
            Placed {formatDate(order.createdAt)} · Source: {gateway.sourceLabel}
          </>
        }
        actions={<LinkButton href="/admin/orders">Back to orders</LinkButton>}
      />
      <Flash params={query} />

      <div className="mb-6" data-testid="order-status">
        <OrderStatusBadges status={order.status} test={order.test} />
        {order.cancelledAt && (
          <p className="mt-2 text-sm text-neutral-700">
            Cancelled {formatDate(order.cancelledAt)}
            {order.cancelReason ? ` — ${order.cancelReason}` : ''}
          </p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="min-w-0">
          <Card title="Items">
            <TableWrap label="Order items">
              <thead>
                <tr>
                  <th className={th}>Item</th>
                  <th className={th}>SKU</th>
                  <th className={th}>Qty</th>
                  <th className={th}>Unit</th>
                  <th className={th}>Discount</th>
                  <th className={th}>Total</th>
                </tr>
              </thead>
              <tbody>
                {order.lines.map((line, index) => (
                  <tr key={index} data-testid="order-line">
                    <td className={td}>
                      <span className="font-semibold">{line.title}</span>
                      {line.variantTitle && <span className="block text-xs text-neutral-600">{line.variantTitle}</span>}
                    </td>
                    <td className={td}>{line.sku ?? '—'}</td>
                    <td className={`${td} tabular-nums`}>{line.quantity}</td>
                    <td className={`${td} tabular-nums`}>{formatMoney(line.unitPrice)}</td>
                    <td className={`${td} tabular-nums`}>{line.discount.amount > 0 ? `−${formatMoney(line.discount)}` : '—'}</td>
                    <td className={`${td} tabular-nums`}>{formatMoney(line.total)}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>

            <dl className="mt-4 ml-auto grid max-w-sm grid-cols-2 gap-y-1 text-sm">
              <dt className="text-neutral-600">Subtotal</dt>
              <dd className="text-right tabular-nums">{formatMoney(order.subtotal)}</dd>
              {order.discounts.amount > 0 && (
                <>
                  <dt className="text-neutral-600">
                    Discounts{order.discountCodes.length > 0 ? ` (${order.discountCodes.join(', ')})` : ''}
                  </dt>
                  <dd className="text-right tabular-nums">−{formatMoney(order.discounts)}</dd>
                </>
              )}
              <dt className="text-neutral-600">Shipping</dt>
              <dd className="text-right tabular-nums">{formatMoney(order.shipping)}</dd>
              <dt className="text-neutral-600">Tax</dt>
              <dd className="text-right tabular-nums">{formatMoney(order.tax)}</dd>
              <dt className="font-bold">Total</dt>
              <dd className="text-right font-bold tabular-nums" data-testid="order-total">{formatMoney(order.total)}</dd>
              {order.refunded.amount > 0 && (
                <>
                  <dt className="text-neutral-600">Refunded</dt>
                  <dd className="text-right tabular-nums" data-testid="order-refunded">−{formatMoney(order.refunded)}</dd>
                </>
              )}
            </dl>
          </Card>

          <Card
            title="Shipments"
            description="A shipment is “delivered” only when someone records it. Nothing here is assumed from the time since it shipped."
          >
            {order.fulfillments.length === 0 ? (
              <p className="text-sm text-neutral-600">Nothing has shipped yet.</p>
            ) : (
              <ul className="space-y-3">
                {order.fulfillments.map((shipment) => {
                  const delivered = shipment.status.toLowerCase() === 'delivered';
                  return (
                    <li key={shipment.id} className="border border-neutral-200 p-3 text-sm" data-testid="order-shipment">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={delivered ? 'good' : 'neutral'}>{delivered ? 'Delivered' : 'Shipped'}</Badge>
                        <span>{formatDate(shipment.createdAt)}</span>
                      </div>
                      <p className="mt-2">
                        {shipment.trackingNumber ? (
                          <>
                            {shipment.trackingCompany ?? 'Tracking'}:{' '}
                            {shipment.trackingUrl ? (
                              <a href={shipment.trackingUrl} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-4">
                                {shipment.trackingNumber}
                              </a>
                            ) : (
                              <span className="font-semibold">{shipment.trackingNumber}</span>
                            )}
                          </>
                        ) : (
                          <span className="text-neutral-600">No tracking number recorded.</span>
                        )}
                      </p>
                      {canEdit && !delivered && gateway.mode === 'native' && (
                        <form action={markDeliveredAction} className="mt-3">
                          <input type="hidden" name="id" value={order.id} />
                          <input type="hidden" name="fulfillmentId" value={shipment.id} />
                          <Button variant="secondary" testId="order-mark-delivered">Mark delivered</Button>
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {canFulfil && (
              <form action={fulfillOrderAction} className="mt-5 grid gap-4 border-t border-neutral-200 pt-5 sm:grid-cols-2" data-testid="order-fulfil-form">
                <input type="hidden" name="id" value={order.id} />
                <TextField label="Carrier" name="trackingCompany" maxLength={60} placeholder="Canada Post" />
                <TextField label="Tracking number" name="trackingNumber" maxLength={80} />
                <TextField label="Tracking link" name="trackingUrl" type="url" maxLength={300} placeholder="https://…" wrapClass="sm:col-span-2" hint="Optional. Must start with https:// and needs a tracking number." />
                <div className="sm:col-span-2">
                  <Checkbox
                    label="Email the customer that it has shipped"
                    name="notifyCustomer"
                    defaultChecked
                    hint="Sent once, for this shipment, when an email provider is connected. In the sandbox nothing is sent."
                  />
                </div>
                <ConfirmField word="FULFIL" id="confirm-fulfil" />
                <div className="self-end">
                  <Button testId="order-fulfil">Mark everything outstanding as shipped</Button>
                </div>
                <p className="text-xs leading-relaxed text-neutral-600 sm:col-span-2">
                  This takes the shipped units off the shelf and cannot be undone from here.
                </p>
              </form>
            )}
          </Card>

          {canRefund && !order.cancelledAt && !shipped && (
            <Card
              id="cancel"
              title="Cancel order"
              description="For an order that has not shipped. Its stock goes back on sale immediately. Once anything has shipped, refund the returned items instead."
            >
              <form action={cancelOrderAction} className="grid gap-4 sm:grid-cols-2" data-testid="order-cancel-form">
                <input type="hidden" name="id" value={order.id} />
                <TextArea label="Reason" name="reason" required minLength={3} maxLength={500} rows={2} wrapClass="sm:col-span-2" hint="Kept on the order and in the audit log." />
                <div className="sm:col-span-2">
                  <Checkbox
                    label={`Also refund the remaining paid amount (${formatMoney(cents(refundable, order.total.currency))})`}
                    name="refund"
                    defaultChecked={paid}
                    hint="Returned to the customer’s original payment method through the payment provider."
                  />
                </div>
                <ConfirmField word="CANCEL" id="confirm-cancel" />
                <div className="self-end">
                  <Button variant="danger" testId="order-cancel">Cancel this order</Button>
                </div>
              </form>
            </Card>
          )}

          {canRefund && paid && refundable > 0 && (
            <Card
              id="refund"
              title="Refund"
              description={
                <>
                  Refundable: <strong data-testid="order-refundable">{formatMoney(cents(refundable, order.total.currency))}</strong> (total paid less
                  what has already been refunded). The money goes back to the original payment method through the payment
                  provider, and the refund is recorded on the order.
                </>
              }
            >
              <form action={refundOrderAction} className="grid gap-4 sm:grid-cols-2" data-testid="order-refund-form">
                <input type="hidden" name="id" value={order.id} />
                <input type="hidden" name="key" value={refundKey} />
                <TextField
                  label={`Amount (${order.total.currency})`}
                  name="amount"
                  inputMode="decimal"
                  required
                  pattern="\d{1,7}(\.\d{1,2})?"
                  placeholder={(refundable / 100).toFixed(2)}
                  hint="Dollars and cents, for example 45.00."
                />
                <TextArea label="Reason" name="reason" required minLength={3} maxLength={500} rows={2} />
                <ConfirmField word="REFUND" id="confirm-refund" />
                <div className="self-end">
                  <Button variant="danger" testId="order-refund">Refund</Button>
                </div>
                <p className="text-xs leading-relaxed text-neutral-600 sm:col-span-2">
                  Submitting this form twice refunds once: it carries a one-time key. To refund again, reload the page.
                  Returned items are put back into stock from Inventory.
                </p>
              </form>
            </Card>
          )}
        </div>

        <div className="min-w-0">
          <Card title="Customer">
            <p className="text-sm font-semibold">{order.customerName ?? 'Guest'}</p>
            {order.email && <p className="text-sm text-neutral-700">{order.email}</p>}
            {order.customerId && can(session.role, 'customers.view') && (
              <p className="mt-2 text-sm">
                <Link href={`/admin/customers/${order.customerId}`} className="underline underline-offset-4">
                  View customer
                </Link>
              </p>
            )}
            <h3 className="mt-4 text-xs font-bold tracking-[0.1em] text-neutral-700 uppercase">Shipping to</h3>
            {order.shippingAddress.length > 0 ? (
              <address className="mt-1 text-sm leading-relaxed not-italic">
                {order.shippingAddress.map((line, index) => (
                  <span key={index} className="block">
                    {line}
                  </span>
                ))}
              </address>
            ) : (
              <p className="mt-1 text-sm text-neutral-600">No shipping address on this order.</p>
            )}
          </Card>

          <Card id="notes" title="Internal note" description="Staff only. Never shown to the customer.">
            {canEdit ? (
              <form action={saveOrderNoteAction} className="space-y-3">
                <input type="hidden" name="id" value={order.id} />
                <TextArea label="Note" name="note" defaultValue={order.note} maxLength={2000} rows={4} />
                <Button variant="secondary" testId="order-note-save">Save note</Button>
              </form>
            ) : (
              <p className="text-sm whitespace-pre-wrap">{order.note || 'No note.'}</p>
            )}
          </Card>

          <Card title="Activity" description="Who did what on this order, from this dashboard.">
            {notes.length === 0 ? (
              <p className="text-sm text-neutral-600">No staff activity recorded yet.</p>
            ) : (
              <ol className="space-y-3 text-sm" data-testid="order-activity">
                {notes.map((entry) => (
                  <li key={entry.id} className="border-l-2 border-neutral-300 pl-3">
                    <p className="text-xs text-neutral-600">
                      {NOTE_LABEL[entry.kind] ?? entry.kind} · {formatDate(entry.at)} · {entry.by}
                    </p>
                    <p className="whitespace-pre-wrap">{entry.text}</p>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
