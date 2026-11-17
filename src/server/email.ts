/**
 * Outbound email — contact-form routing only.
 *
 * Order confirmations, shipping notifications and login emails are sent by
 * Shopify. This module sends exactly one kind of message: a copy of a support
 * ticket to the team's inbox, and only when an email provider is configured.
 * It never emails customers, so it can never duplicate a Shopify notification
 * or send marketing.
 *
 * Without a provider it reports `false` and the ticket simply stays in the
 * admin inbox — the form's confirmation copy does not promise an email.
 */
import 'server-only';

import { config } from './config';
import type { Ticket } from './records';
import { maskEmail } from './security';

export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Header values must not contain line breaks (header injection). */
const headerSafe = (value: string): string => value.replace(/[\r\n]+/g, ' ').slice(0, 200);

export function isEmailConfigured(): boolean {
  return Boolean(config.email.resendKey && config.email.contactTo && config.email.from);
}

export function ticketEmail(ticket: Ticket): { subject: string; html: string; text: string } {
  const rows: Array<[string, string]> = [
    ['Topic', ticket.topic],
    ['Name', ticket.name],
    ['Email', ticket.email],
    ['Phone', ticket.phone ?? '—'],
    ['Order', ticket.orderNumber ?? '—'],
    ['Ticket', ticket.id],
  ];
  const text = `${rows.map(([label, value]) => `${label}: ${value}`).join('\n')}\n\n${ticket.message}`;
  const html =
    `<table>${rows.map(([label, value]) => `<tr><th align="left">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join('')}</table>` +
    `<p style="white-space:pre-wrap">${escapeHtml(ticket.message)}</p>`;
  return { subject: headerSafe(`[INFNITY ${ticket.topic}] ${ticket.name}`), html, text };
}

/** Sends the ticket to the team inbox. Resolves true only when the provider accepted it. */
export async function sendTicketEmail(ticket: Ticket, fetcher: typeof fetch = fetch): Promise<boolean> {
  const { resendKey, contactTo, from } = config.email;
  if (!resendKey || !contactTo || !from) return false;
  const { subject, html, text } = ticketEmail(ticket);
  try {
    const response = await fetcher('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${resendKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: [contactTo], reply_to: headerSafe(ticket.email), subject, html, text }),
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });
    if (!response.ok) {
      console.error(`[email] provider responded ${response.status} for ticket ${ticket.id} (${maskEmail(ticket.email)})`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`[email] could not send ticket ${ticket.id}: ${(error as Error).message}`);
    return false;
  }
}
