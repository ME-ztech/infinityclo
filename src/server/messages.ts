import 'server-only';

import { desc, eq, inArray } from 'drizzle-orm';

import { audit, type AuditActor } from '@/server/audit';
import { getSettings } from '@/server/content/cms';
import { getDb } from '@/server/db/client';
import { messages } from '@/server/db/schema';
import { sendEmail } from '@/server/email';

export const MESSAGE_KINDS = ['contact', 'order_help', 'return', 'exchange'] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];
export const MESSAGE_STATUSES = ['new', 'open', 'resolved', 'spam'] as const;

export const MESSAGE_KIND_LABELS: Record<MessageKind, string> = {
  contact: 'General enquiry',
  order_help: 'Help with an order',
  return: 'Return request',
  exchange: 'Exchange request',
};

/**
 * Stores a customer message in the staff inbox and notifies the notification
 * address if email is configured. Return/exchange requests are requests only:
 * nothing is refunded or cancelled automatically — staff review against the
 * published refund policy and act in Shopify.
 */
export async function createMessage(input: {
  kind: MessageKind;
  name: string;
  email: string;
  orderNumber: string | null;
  subject: string | null;
  body: string;
  shopifyCustomerId?: string | null;
  ipHash: string | null;
}): Promise<string> {
  const db = await getDb();
  const [row] = await db
    .insert(messages)
    .values({
      kind: input.kind,
      name: input.name,
      email: input.email.toLowerCase(),
      orderNumber: input.orderNumber,
      subject: input.subject,
      body: input.body,
      shopifyCustomerId: input.shopifyCustomerId ?? null,
      ipHash: input.ipHash,
    })
    .returning({ id: messages.id });

  const settings = await getSettings();
  if (settings.notificationEmail) {
    await sendEmail({
      to: settings.notificationEmail,
      subject: `[INFNITY] ${MESSAGE_KIND_LABELS[input.kind]}${input.orderNumber ? ` — ${input.orderNumber}` : ''}`,
      template: 'staff-new-message',
      replyTo: input.email,
      text: `${input.name} <${input.email}> wrote:\n\n${input.body}\n\nOpen the inbox: /admin/messages/${row!.id}`,
    });
  }
  return row!.id;
}

export async function listMessages(statuses: string[] = ['new', 'open']) {
  const db = await getDb();
  return db
    .select()
    .from(messages)
    .where(inArray(messages.status, statuses))
    .orderBy(desc(messages.createdAt))
    .limit(200);
}

export async function getMessage(id: string) {
  const db = await getDb();
  const [row] = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
  return row ?? null;
}

export async function updateMessage(
  id: string,
  update: { status?: string; note?: string },
  actor: AuditActor,
) {
  const db = await getDb();
  const current = await getMessage(id);
  if (!current) throw new Error('Message not found.');
  const notes = update.note
    ? [
        ...current.notes,
        { at: new Date().toISOString(), by: actor.email ?? 'staff', text: update.note },
      ]
    : current.notes;
  await db
    .update(messages)
    .set({ status: update.status ?? current.status, notes, updatedAt: new Date() })
    .where(eq(messages.id, id));
  await audit({
    actor,
    action: 'message.update',
    summary: `Updated message ${id}${update.status ? ` → ${update.status}` : ''}`,
    targetType: 'message',
    targetId: id,
  });
}
