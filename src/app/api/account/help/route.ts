/**
 * Help, return and exchange requests from a signed-in customer.
 *
 * This opens a ticket for the team to review. It does not cancel, refund or
 * exchange anything: those are decisions staff make in Shopify, against the
 * published returns policy.
 *
 * The customer id and email on the ticket come from Shopify via the session
 * token, and the order number is accepted only if it is one of this customer's
 * own orders.
 */
import type { NextRequest } from 'next/server';

import { formField, handleAccountMutation } from '@/server/customer/mutations';
import { sendTicketEmail } from '@/server/email';
import { createTicket, saveTicket, type TicketTopic } from '@/server/records';

export const dynamic = 'force-dynamic';

const TOPICS: readonly TicketTopic[] = ['return', 'order', 'sizing', 'other'];
const KIND_LABEL: Record<string, string> = { return: 'Return', exchange: 'Exchange', order: 'Order question', sizing: 'Sizing', other: 'Other' };

export function POST(request: NextRequest) {
  return handleAccountMutation(request, { scope: 'help', page: '/account/help', limit: 5 }, async ({ form, session, gateway }) => {
    const kind = String(form.get('kind') ?? 'other');
    const message = formField(form, 'message', 3000);
    const orderId = String(form.get('orderId') ?? '');
    if (!(kind in KIND_LABEL)) return { ok: false, errors: ['Choose what you need help with.'] };
    if (message.length < 10) return { ok: false, errors: ['Tell us a little more so we can help (at least 10 characters).'] };

    const profile = await gateway.getProfile(session.accessToken);
    if (!profile.email) return { ok: false, errors: ['Your account has no email address on file, so we cannot reply.'] };

    let orderNumber: string | null = null;
    if (orderId) {
      const order = /^\d{1,20}$/.test(orderId) ? await gateway.getOrder(session.accessToken, orderId) : null;
      if (!order) return { ok: false, errors: ['That order could not be found on your account.'] };
      orderNumber = order.name;
    } else if (kind === 'return' || kind === 'exchange') {
      return { ok: false, errors: ['Choose the order this request is about.'] };
    }

    const topic: TicketTopic = kind === 'exchange' ? 'return' : TOPICS.includes(kind as TicketTopic) ? (kind as TicketTopic) : 'other';
    const ticket = await createTicket({
      topic,
      name: profile.displayName || [profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'Customer',
      email: profile.email,
      phone: null,
      orderNumber,
      message: `[${KIND_LABEL[kind]} request from account]\n${message}`,
      customerId: profile.id,
    });
    if (await sendTicketEmail(ticket)) await saveTicket({ ...ticket, emailed: true });

    return { ok: true, notice: 'Request received. The team will review it and reply by email.' };
  });
}
