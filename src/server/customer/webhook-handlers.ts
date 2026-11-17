/**
 * What each Shopify webhook topic does here.
 *
 * Shopify is the system of record, so the handlers are deliberately thin:
 *
 *   catalogue topics   invalidate the storefront's catalogue cache, so a price,
 *                      stock or publish change shows up without a deployment.
 *   order topics       no handler. `processWebhook` keeps a receipt (id, topic,
 *                      time) and nothing else: order state is always read back
 *                      from Shopify, never rebuilt from payloads.
 *   privacy topics     the three webhooks Shopify requires of every app. A
 *                      redaction request deletes the matching records this
 *                      application holds — newsletter consent, waitlist entries
 *                      and support tickets.
 */
import 'server-only';

import type { Subscriber, Ticket, WaitlistEntry } from '../records';
import { maskEmail, normaliseEmail } from '../security';
import type { WebhookHandler } from '../shopify/webhooks';
import { getStore } from '../store';

export const CATALOG_TOPICS = [
  'products/create',
  'products/update',
  'products/delete',
  'inventory_levels/update',
  'collections/create',
  'collections/update',
  'collections/delete',
] as const;

/** Receipt-only topics, listed so the docs and the subscription list stay in step. */
export const ORDER_TOPICS = [
  'orders/create',
  'orders/paid',
  'orders/updated',
  'orders/cancelled',
  'orders/fulfilled',
  'fulfillments/create',
  'fulfillments/update',
  'refunds/create',
] as const;

export const PRIVACY_TOPICS = ['customers/data_request', 'customers/redact', 'shop/redact'] as const;

/** Deletes every local record held for an email address. Returns how many were removed. */
export async function redactEmail(email: string): Promise<number> {
  const store = getStore();
  let removed = 0;
  const [subscribers, waitlist, tickets] = await Promise.all([
    store.list<Subscriber>('subscribers'),
    store.list<WaitlistEntry>('waitlist'),
    store.list<Ticket>('tickets'),
  ]);
  for (const record of subscribers.filter((entry) => entry.email === email)) {
    await store.delete('subscribers', record.id);
    removed += 1;
  }
  for (const record of waitlist.filter((entry) => entry.email === email)) {
    await store.delete('waitlist', record.id);
    removed += 1;
  }
  for (const record of tickets.filter((entry) => entry.email.toLowerCase() === email)) {
    await store.delete('tickets', record.id);
    removed += 1;
  }
  return removed;
}

/** Deletes local records tied to a Shopify customer id (tickets raised from /account). */
async function redactCustomerId(customerId: string): Promise<number> {
  const store = getStore();
  const tickets = (await store.list<Ticket>('tickets')).filter((ticket) => ticket.customerId === customerId);
  for (const ticket of tickets) await store.delete('tickets', ticket.id);
  return tickets.length;
}

async function redactShop(): Promise<number> {
  const store = getStore();
  let removed = 0;
  for (const collection of ['subscribers', 'waitlist', 'tickets'] as const) {
    for (const record of await store.list<{ id: string }>(collection)) {
      await store.delete(collection, record.id);
      removed += 1;
    }
  }
  return removed;
}

export function buildWebhookHandlers(invalidateCatalog: () => void | Promise<void>): Record<string, WebhookHandler> {
  const handlers: Record<string, WebhookHandler> = {};

  for (const topic of CATALOG_TOPICS) handlers[topic] = () => invalidateCatalog();

  handlers['customers/redact'] = async (payload) => {
    const customer = (payload.customer ?? {}) as Record<string, unknown>;
    const email = normaliseEmail(customer.email);
    let removed = 0;
    if (email) removed += await redactEmail(email);
    if (customer.id !== undefined && customer.id !== null) removed += await redactCustomerId(String(customer.id));
    console.info(`[webhook] customers/redact removed ${removed} record(s)${email ? ` for ${maskEmail(email)}` : ''}`);
  };

  handlers['shop/redact'] = async () => {
    const removed = await redactShop();
    console.info(`[webhook] shop/redact removed ${removed} record(s)`);
  };

  // A data request is fulfilled by the merchant from Shopify plus the admin's
  // own exports; the receipt is the record that it arrived.
  handlers['customers/data_request'] = async (payload) => {
    const email = normaliseEmail(((payload.customer ?? {}) as Record<string, unknown>).email);
    console.info(`[webhook] customers/data_request received${email ? ` for ${maskEmail(email)}` : ''}`);
  };

  return handlers;
}
