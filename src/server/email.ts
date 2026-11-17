import 'server-only';

import { getDb } from '@/server/db/client';
import { outboundEmails } from '@/server/db/schema';

/**
 * App-owned email only (newsletter confirmation, waitlist confirmation, staff
 * notifications). Order, shipping and account emails are Shopify's — sending
 * them here as well would duplicate them.
 *
 * Without RESEND_API_KEY nothing is sent and the attempt is recorded as
 * `not_sent_no_provider`, visible in Admin → Marketing. Never a silent success.
 */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly template: string;
  readonly text: string;
  readonly html?: string;
  readonly replyTo?: string;
}

export async function sendEmail(
  message: EmailMessage,
): Promise<'sent' | 'failed' | 'not_sent_no_provider'> {
  const db = await getDb();
  if (!isEmailConfigured()) {
    await db.insert(outboundEmails).values({
      to: message.to,
      subject: message.subject,
      template: message.template,
      status: 'not_sent_no_provider',
    });
    return 'not_sent_no_provider';
  }
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!response.ok) throw new Error(body.message ?? `HTTP ${response.status}`);
    await db.insert(outboundEmails).values({
      to: message.to,
      subject: message.subject,
      template: message.template,
      status: 'sent',
      providerId: body.id ?? null,
    });
    return 'sent';
  } catch (error) {
    await db.insert(outboundEmails).values({
      to: message.to,
      subject: message.subject,
      template: message.template,
      status: 'failed',
      error: (error as Error).message.slice(0, 300),
    });
    return 'failed';
  }
}
