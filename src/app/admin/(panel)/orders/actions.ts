'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { audit } from '@/server/audit';
import { actorOf, runAction, type ActionResult } from '@/server/admin/action';
import { addOrderTags, fulfillOrder, updateOrderNoteAndTags } from '@/server/shopify/admin';

const orderId = z.string().regex(/^\d+$/);

export async function updateNoteAction(
  _state: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  return runAction('orders:write', async (user) => {
    const id = orderId.parse(form.get('id'));
    const note = z
      .string()
      .max(5000)
      .parse(form.get('note') ?? '');
    const tags = String(form.get('tags') ?? '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 50);
    await updateOrderNoteAndTags(id, note || null, tags);
    await audit({
      actor: actorOf(user),
      action: 'order.note',
      summary: `Updated note/tags on order ${id}`,
      targetType: 'order',
      targetId: id,
    });
    revalidatePath(`/admin/orders/${id}`);
    return 'Note and tags saved to Shopify.';
  });
}

export async function fulfilAction(
  _state: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  return runAction('orders:fulfill', async (user) => {
    const id = orderId.parse(form.get('id'));
    const fulfillmentOrderIds = form
      .getAll('fulfillmentOrderId')
      .map(String)
      .filter((value) => value.startsWith('gid://shopify/FulfillmentOrder/'));
    if (fulfillmentOrderIds.length === 0) throw new Error('Nothing left to fulfil on this order.');
    const tracking = {
      company:
        z
          .string()
          .max(100)
          .parse(form.get('company') ?? '') || null,
      number:
        z
          .string()
          .max(100)
          .parse(form.get('number') ?? '') || null,
      url:
        (z
          .string()
          .url()
          .or(z.literal(''))
          .parse(form.get('url') ?? '') as string) || null,
    };
    const notifyCustomer = form.get('notify') === 'on';
    const fulfillmentId = await fulfillOrder({ fulfillmentOrderIds, tracking, notifyCustomer });
    await audit({
      actor: actorOf(user),
      action: 'order.fulfil',
      summary: `Fulfilled order ${id}${tracking.number ? ` with tracking ${tracking.company ?? ''} ${tracking.number}` : ' without tracking'}${notifyCustomer ? '; Shopify notified the customer' : ''}`,
      targetType: 'order',
      targetId: id,
      metadata: { fulfillmentId },
    });
    revalidatePath(`/admin/orders/${id}`);
    return notifyCustomer
      ? 'Fulfilled. Shopify has emailed the customer their shipping confirmation.'
      : 'Fulfilled.';
  });
}

/**
 * Records a cancellation or refund REQUEST (tag + note + audit). The money
 * itself moves only in Shopify admin, with Shopify's own safeguards and an
 * owner's hand on it — never automatically from here.
 */
export async function requestCancelRefundAction(
  _state: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  return runAction('orders:write', async (user) => {
    const id = orderId.parse(form.get('id'));
    const kind = z.enum(['cancel', 'refund']).parse(form.get('kind'));
    const reason = z.string().trim().min(5, 'Give a reason').max(500).parse(form.get('reason'));
    await addOrderTags(id, [`${kind}-requested`]);
    await audit({
      actor: actorOf(user),
      action: `order.${kind}_requested`,
      summary: `${kind === 'cancel' ? 'Cancellation' : 'Refund'} requested for order ${id}: ${reason}`,
      targetType: 'order',
      targetId: id,
    });
    revalidatePath(`/admin/orders/${id}`);
    return `Request recorded and the order tagged "${kind}-requested". The owner completes it in Shopify admin.`;
  });
}
