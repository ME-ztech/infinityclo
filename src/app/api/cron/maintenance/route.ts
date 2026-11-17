/**
 * Scheduled maintenance. Call every ~10 minutes (Vercel Cron, or any scheduler)
 * with `Authorization: Bearer <CRON_SECRET>`.
 *
 *   1. Releases the stock held by checkouts that expired, so abandoned
 *      checkouts cannot keep items off sale.
 *   2. Sends abandoned-checkout reminders — one each, only to people who ticked
 *      "email me a reminder" at checkout, and only when email is configured.
 *
 * Both steps are idempotent: running this twice sends nothing twice.
 */
import { and, eq, isNull, lt } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { SITE_URL } from '@/lib/site';
import { sendEmail } from '@/server/commerce/emails';
import { releaseExpiredReservations } from '@/server/commerce/inventory';
import { config } from '@/server/config';
import { getDb, isDatabaseConfigured, schema } from '@/server/db/client';
import { escapeHtml } from '@/server/email';
import { safeEqual } from '@/server/security';

export const dynamic = 'force-dynamic';

async function sendRecoveryReminders(): Promise<number> {
  if (!config.email.configured) return 0;
  const db = await getDb();
  const cutoff = new Date(Date.now() - 60 * 60_000);
  const candidates = await db
    .select()
    .from(schema.checkouts)
    .where(
      and(
        eq(schema.checkouts.status, 'expired'),
        eq(schema.checkouts.recoveryConsent, true),
        isNull(schema.checkouts.recoverySentAt),
        lt(schema.checkouts.updatedAt, cutoff),
      ),
    )
    .limit(50);

  let sent = 0;
  for (const checkout of candidates) {
    if (!checkout.email) continue;
    // Claim first, so a concurrent run cannot send the same reminder.
    const claimed = await db
      .update(schema.checkouts)
      .set({ recoverySentAt: new Date() })
      .where(and(eq(schema.checkouts.id, checkout.id), isNull(schema.checkouts.recoverySentAt)))
      .returning({ id: schema.checkouts.id });
    if (claimed.length === 0) continue;
    const items = checkout.lines.map((line) => `${line.quantity} × ${line.title} (${line.variantTitle})`);
    const link = `${SITE_URL}/shop`;
    const ok = await sendEmail({
      to: checkout.email,
      subject: 'You left something at INFNITY',
      text: `You asked for a reminder if you didn't finish checking out.\n\n${items.join('\n')}\n\nItems are not held, so availability may have changed: ${link}\n\nThis is the only reminder we will send for this cart.`,
      html: `<p>You asked for a reminder if you didn’t finish checking out.</p><p>${items.map(escapeHtml).join('<br>')}</p><p>Items are not held, so availability may have changed.</p><p><a href="${link}">Return to INFNITY</a></p><p style="color:#666;font-size:12px">This is the only reminder we will send for this cart.</p>`,
    });
    if (ok) sent += 1;
  }
  return sent;
}

export async function GET(request: Request): Promise<NextResponse> {
  const secret = config.cronSecret;
  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!secret || !safeEqual(provided, secret)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  if (!isDatabaseConfigured()) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });

  const released = await releaseExpiredReservations();
  const reminders = await sendRecoveryReminders();
  return NextResponse.json({ releasedReservations: released, recoveryReminders: reminders });
}
