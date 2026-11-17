'use server';

/**
 * Order actions that move money or close an order: refund, cancel, and
 * recording a delivery.
 *
 * Each runs inside `runAction` (same-origin, permission, audit). Refunds and
 * cancellations additionally need a typed confirmation word, and a refund
 * carries an idempotency key minted when the page was rendered — so a double
 * submit, a retried request or a browser "resend" returns the first refund
 * instead of paying out twice.
 */
import { revalidatePath } from 'next/cache';

import { checked, field, priceCents, runAction } from '@/server/admin/action';
import { GatewayError, type CommerceGateway } from '@/server/admin/gateway';
import { logOrderNote } from '@/server/admin/settings';
import { markDelivered } from '@/server/commerce/orders';

function need(gateway: CommerceGateway | null): CommerceGateway {
  if (!gateway) throw new GatewayError('The commerce database is not configured, so this change cannot be saved.');
  return gateway;
}

const dollars = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

export async function refundOrderAction(form: FormData): Promise<void> {
  const id = field(form, 'id', 80);
  await runAction(
    { permission: 'orders.refund', action: 'order.refund', back: `/admin/orders/${id}#refund`, commerce: true, target: `order:${id}` },
    async ({ gateway, session }) => {
      if (field(form, 'confirm', 20) !== 'REFUND') throw new GatewayError('Type REFUND to confirm.');
      const amountCents = priceCents(form, 'amount');
      if (amountCents === null || amountCents <= 0) throw new GatewayError('Enter a refund amount greater than zero, for example 45.00.');
      const reason = field(form, 'reason', 500);
      if (reason.length < 3) throw new GatewayError('Give a reason for the refund. It is kept on the order.');
      const key = field(form, 'key', 80);
      if (!/^[A-Za-z0-9-]{8,80}$/.test(key)) throw new GatewayError('This form has expired. Reload the order and try again.');

      await need(gateway).refundOrder(id, { amountCents, reason, idempotencyKey: key, actor: session.email });
      await logOrderNote({ orderId: id, by: session.email, text: `Refunded ${dollars(amountCents)}. ${reason}`, kind: 'refund' });
      revalidatePath('/account/orders');
      return { message: `Refunded ${dollars(amountCents)}.`, detail: `Refund ${dollars(amountCents)}; key ${key.slice(0, 8)}.` };
    },
  );
}

export async function cancelOrderAction(form: FormData): Promise<void> {
  const id = field(form, 'id', 80);
  await runAction(
    { permission: 'orders.refund', action: 'order.cancel', back: `/admin/orders/${id}#cancel`, commerce: true, target: `order:${id}` },
    async ({ gateway, session }) => {
      if (field(form, 'confirm', 20) !== 'CANCEL') throw new GatewayError('Type CANCEL to confirm.');
      const reason = field(form, 'reason', 500);
      if (reason.length < 3) throw new GatewayError('Give a reason for the cancellation. It is kept on the order.');
      const refund = checked(form, 'refund');

      await need(gateway).cancelOrder(id, { reason, refund, actor: session.email });
      const summary = refund ? 'Order cancelled and the remaining paid amount refunded.' : 'Order cancelled. Nothing was refunded.';
      await logOrderNote({ orderId: id, by: session.email, text: `${summary} ${reason}`, kind: 'cancel' });
      // Unshipped stock is on sale again.
      revalidatePath('/', 'layout');
      return { message: summary, detail: summary };
    },
  );
}

/**
 * Records that a shipment arrived. Only ever done on evidence — a carrier
 * confirmation or the customer saying so — which is why it is a deliberate
 * staff action and never inferred from time passing.
 */
export async function markDeliveredAction(form: FormData): Promise<void> {
  const id = field(form, 'id', 80);
  await runAction(
    { permission: 'orders.edit', action: 'order.delivered', back: `/admin/orders/${id}`, commerce: true, target: `order:${id}` },
    async ({ gateway, session }) => {
      if (need(gateway).mode !== 'native') throw new GatewayError('Delivery can only be recorded on real orders, not in the sandbox.');
      const fulfillmentId = field(form, 'fulfillmentId', 80);
      if (!fulfillmentId) throw new GatewayError('Unknown shipment.');
      await markDelivered(fulfillmentId, session.email);
      await logOrderNote({ orderId: id, by: session.email, text: 'Shipment marked delivered.', kind: 'delivered' });
      return { message: 'Shipment marked delivered.', detail: `Fulfilment ${fulfillmentId} delivered.` };
    },
  );
}
