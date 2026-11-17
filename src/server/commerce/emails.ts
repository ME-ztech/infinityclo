/**
 * Transactional email to customers: account verification, password reset,
 * order confirmation and shipping notification.
 *
 * These are service messages about something the customer just did. None is
 * marketing, none depends on marketing consent, and none is ever sent twice
 * for the same event (each call site runs exactly once per event).
 *
 * Delivery goes through Resend when configured. Without a provider:
 *   - in development the message is written to the server log, so sign-up and
 *     reset can be exercised locally;
 *   - in production nothing is logged (a reset link in a log is a credential)
 *     and the function reports `false`.
 *
 * Every interpolated value is HTML-escaped.
 */
import 'server-only';

import { SITE_URL } from '@/lib/site';

import { config } from '../config';
import { escapeHtml } from '../email';
import { maskEmail } from '../security';

import type { OrderDetail } from './orders';

export interface OutboundEmail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

type Sender = (email: OutboundEmail) => Promise<boolean>;

const globalEmail = globalThis as typeof globalThis & { __infnityEmailSender?: Sender | null; __infnityOutbox?: OutboundEmail[] };

/** Tests capture mail instead of sending it. */
export function captureEmailsForTesting(): OutboundEmail[] {
  const outbox: OutboundEmail[] = [];
  globalEmail.__infnityOutbox = outbox;
  globalEmail.__infnityEmailSender = async (email) => {
    outbox.push(email);
    return true;
  };
  return outbox;
}

const headerSafe = (value: string): string => value.replace(/[\r\n]+/g, ' ').slice(0, 200);

export async function sendEmail(email: OutboundEmail, fetcher: typeof fetch = fetch): Promise<boolean> {
  if (globalEmail.__infnityEmailSender) return globalEmail.__infnityEmailSender(email);

  // Browser tests read mail from a file instead of an inbox. Only honoured
  // outside production or in the E2E harness's explicitly marked build.
  const outbox = process.env.INFNITY_EMAIL_OUTBOX;
  if (outbox && (!config.isProduction || process.env.INFNITY_E2E === '1')) {
    const { appendFile, mkdir } = await import('node:fs/promises');
    const { dirname, resolve } = await import('node:path');
    const file = resolve(/* turbopackIgnore: true */ process.cwd(), outbox);
    await mkdir(dirname(file), { recursive: true });
    await appendFile(file, `${JSON.stringify({ to: email.to, subject: email.subject, text: email.text })}\n`);
    return true;
  }

  const { resendKey, from } = config.email;
  if (!resendKey || !from) {
    if (!config.isProduction) {
      console.info(`[email:dev] to=${email.to} subject="${email.subject}"\n${email.text}\n`);
    }
    return false;
  }
  try {
    const response = await fetcher('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${resendKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: [email.to], subject: headerSafe(email.subject), html: email.html, text: email.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) console.error(`[email] provider responded ${response.status} for ${maskEmail(email.to)}`);
    return response.ok;
  } catch (error) {
    console.error(`[email] send failed for ${maskEmail(email.to)}: ${(error as Error).message}`);
    return false;
  }
}

const layout = (heading: string, paragraphs: string[], action?: { label: string; url: string }): string =>
  `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#111">` +
  `<p style="font-size:13px;letter-spacing:.18em;font-weight:700">INFNITY</p>` +
  `<h1 style="font-size:22px;margin:24px 0 12px">${escapeHtml(heading)}</h1>` +
  paragraphs.map((paragraph) => `<p style="font-size:15px;line-height:1.55">${paragraph}</p>`).join('') +
  (action
    ? `<p style="margin:28px 0"><a href="${escapeHtml(action.url)}" style="background:#111;color:#fff;padding:14px 22px;text-decoration:none;font-size:13px;letter-spacing:.14em;font-weight:700">${escapeHtml(action.label)}</a></p>` +
      `<p style="font-size:12px;color:#666;word-break:break-all">${escapeHtml(action.url)}</p>`
    : '') +
  `</div>`;

const url = (path: string): string => `${SITE_URL}${path}`;

export function verificationEmail(to: string, token: string): OutboundEmail {
  const link = url(`/account/verify?token=${encodeURIComponent(token)}`);
  return {
    to,
    subject: 'Confirm your INFNITY account',
    text: `Confirm your email address to finish creating your INFNITY account:\n\n${link}\n\nThe link works once and expires in 48 hours. If you did not create an account, ignore this email.`,
    html: layout(
      'Confirm your email',
      ['Confirm your email address to finish creating your INFNITY account. The link works once and expires in 48 hours.', 'If you did not create an account, you can ignore this email.'],
      { label: 'Confirm email', url: link },
    ),
  };
}

/** Sent to an address that already has an account when someone tries to register it again. */
export function accountExistsEmail(to: string): OutboundEmail {
  const link = url('/account/forgot');
  return {
    to,
    subject: 'You already have an INFNITY account',
    text: `Someone tried to create an INFNITY account with this email address, but one already exists. If that was you, sign in — or reset your password here:\n\n${link}\n\nIf it was not you, no action is needed.`,
    html: layout(
      'You already have an account',
      ['Someone tried to create an INFNITY account with this email address, but one already exists.', 'If that was you, sign in or reset your password. If it was not you, no action is needed.'],
      { label: 'Reset password', url: link },
    ),
  };
}

export function passwordResetEmail(to: string, token: string): OutboundEmail {
  const link = url(`/account/reset?token=${encodeURIComponent(token)}`);
  return {
    to,
    subject: 'Reset your INFNITY password',
    text: `Use this link to choose a new password:\n\n${link}\n\nIt works once and expires in 60 minutes. If you did not ask for this, ignore this email and your password stays the same.`,
    html: layout(
      'Reset your password',
      ['Use the button below to choose a new password. The link works once and expires in 60 minutes.', 'If you did not ask for this, ignore this email and your password stays the same.'],
      { label: 'Choose a new password', url: link },
    ),
  };
}

const money = (cents: number, currency: string): string => `$${(cents / 100).toFixed(2)} ${currency}`;

export function orderConfirmationEmail(detail: OrderDetail): OutboundEmail {
  const { order, items } = detail;
  const lines = items.map(
    (item) => `${item.quantity} × ${item.title}${item.variantTitle ? ` (${item.variantTitle})` : ''} — ${money(item.totalCents, order.currency)}`,
  );
  const totals = [
    `Subtotal: ${money(order.subtotalCents, order.currency)}`,
    ...(order.discountCents ? [`Discount: −${money(order.discountCents, order.currency)}`] : []),
    `Shipping${order.shippingName ? ` (${order.shippingName})` : ''}: ${money(order.shippingCents, order.currency)}`,
    ...order.taxLines.map((tax) => `${tax.name}: ${money(tax.amountCents, order.currency)}`),
    `Total paid: ${money(order.totalCents, order.currency)}`,
  ];
  return {
    to: order.email,
    subject: `INFNITY order ${order.name} confirmed`,
    text: `Thanks — your order ${order.name} is confirmed.\n\n${lines.join('\n')}\n\n${totals.join('\n')}\n\nWe will email you again when it ships.`,
    html: layout(`Order ${order.name} confirmed`, [
      'Thanks — your order is confirmed. We will email you again when it ships.',
      lines.map(escapeHtml).join('<br>'),
      totals.map(escapeHtml).join('<br>'),
    ]),
  };
}

export function shippedEmail(detail: OrderDetail, shipment: OrderDetail['fulfillments'][number]): OutboundEmail {
  const tracking = shipment.trackingNumber
    ? `${shipment.trackingCompany ?? 'Tracking number'}: ${shipment.trackingNumber}`
    : 'No tracking number was provided for this shipment.';
  return {
    to: detail.order.email,
    subject: `INFNITY order ${detail.order.name} has shipped`,
    text: `Your order ${detail.order.name} is on its way.\n\n${tracking}${shipment.trackingUrl ? `\n${shipment.trackingUrl}` : ''}`,
    html: layout(
      `Order ${detail.order.name} has shipped`,
      ['Your order is on its way.', escapeHtml(tracking)],
      shipment.trackingUrl ? { label: 'Track shipment', url: shipment.trackingUrl } : undefined,
    ),
  };
}
