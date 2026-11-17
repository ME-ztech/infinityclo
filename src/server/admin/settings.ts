/**
 * Back-office settings that are not commerce data: the low-stock threshold and
 * the local log of who wrote which internal order note.
 */
import 'server-only';

import { getStore, newId } from '../store';

export interface AdminSettings {
  readonly lowStockThreshold: number;
}

const DEFAULTS: AdminSettings = { lowStockThreshold: 5 };

export async function getAdminSettings(): Promise<AdminSettings> {
  try {
    const stored = await getStore().get<Partial<AdminSettings>>('content', 'admin-settings');
    const threshold = Number(stored?.lowStockThreshold);
    return { lowStockThreshold: Number.isInteger(threshold) && threshold >= 0 && threshold <= 1000 ? threshold : DEFAULTS.lowStockThreshold };
  } catch {
    return DEFAULTS;
  }
}

export async function saveAdminSettings(input: { lowStockThreshold: unknown }): Promise<AdminSettings> {
  const threshold = Number(input.lowStockThreshold);
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > 1000) {
    throw new Error('The low-stock threshold must be a whole number between 0 and 1000.');
  }
  const settings: AdminSettings = { lowStockThreshold: threshold };
  await getStore().put('content', 'admin-settings', settings);
  return settings;
}

export interface OrderNoteEntry {
  readonly id: string;
  readonly orderId: string;
  readonly at: string;
  readonly by: string;
  readonly text: string;
  readonly kind: 'note' | 'fulfilment' | 'cancel_request' | 'refund_request' | 'refund' | 'cancel' | 'delivered';
}

export async function logOrderNote(entry: Omit<OrderNoteEntry, 'id' | 'at'>): Promise<void> {
  const record: OrderNoteEntry = { ...entry, id: newId('note'), at: new Date().toISOString(), text: entry.text.slice(0, 2000) };
  await getStore().put('order-notes', record.id, record);
}

export async function listOrderNotes(orderId: string): Promise<OrderNoteEntry[]> {
  const entries = await getStore().list<OrderNoteEntry>('order-notes');
  return entries.filter((entry) => entry.orderId === orderId).sort((a, b) => b.at.localeCompare(a.at));
}
