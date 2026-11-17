/**
 * Contact form.
 *
 * Every valid message becomes a ticket in the admin inbox. If an email provider
 * is configured a copy is also sent to the team's address, with the customer
 * as reply-to. The confirmation states that the message was received; it does
 * not promise a response time the business has not committed to.
 */
import { guardPublicForm, isHoneypotTripped, json, readJsonObject } from '@/server/customer/forms';
import { sendTicketEmail } from '@/server/email';
import { createTicket, saveTicket, TICKET_TOPICS, type TicketTopic } from '@/server/records';
import { cleanText, normaliseEmail } from '@/server/security';

export const dynamic = 'force-dynamic';

const SUCCESS = 'Message received. Thank you — the team will get back to you by email.';

export async function POST(request: Request) {
  const guard = guardPublicForm(request, 'contact', 5);
  if (guard.refused) return guard.refused;

  const body = await readJsonObject(request);
  if (!body) return json({ error: 'Invalid request.' }, 400);
  if (isHoneypotTripped(body.website)) return json({ message: SUCCESS });

  const name = cleanText(body.name, 100);
  const email = normaliseEmail(body.email);
  const message = cleanText(body.message, 4000);
  const phone = cleanText(body.phone, 30);
  const orderNumber = cleanText(body.orderNumber, 30);
  const topic: TicketTopic = TICKET_TOPICS.includes(body.topic as TicketTopic) ? (body.topic as TicketTopic) : 'other';

  const fields: Record<string, string> = {};
  if (name.length < 2) fields.name = 'Enter your name.';
  if (!email) fields.email = 'Enter a valid email address.';
  if (message.length < 10) fields.message = 'Write a message of at least 10 characters.';
  if (phone && !/^[+()\d\s.-]{7,30}$/.test(phone)) fields.phone = 'Enter a valid phone number, or leave it blank.';
  if (orderNumber && !/^#?[A-Za-z0-9-]{1,29}$/.test(orderNumber)) fields.orderNumber = 'Enter the order number as shown in your confirmation email.';
  if (Object.keys(fields).length) return json({ error: 'Please check the highlighted fields.', fields }, 400);

  try {
    const ticket = await createTicket({
      topic,
      name,
      email: email!,
      phone: phone || null,
      orderNumber: orderNumber || null,
      message,
      // Never taken from the form: only /account requests carry a customer id.
      customerId: null,
    });
    if (await sendTicketEmail(ticket)) await saveTicket({ ...ticket, emailed: true });
    return json({ message: SUCCESS });
  } catch (error) {
    console.error(`[contact] could not store message: ${(error as Error).message}`);
    return json({ error: 'We could not send that right now. Please try again.' }, 503);
  }
}
