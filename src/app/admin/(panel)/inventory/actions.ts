'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { z } from 'zod';

import { CATALOG_CACHE_TAG } from '@/data/adapters/shopify/catalog';
import { audit } from '@/server/audit';
import { actorOf, runAction, type ActionResult } from '@/server/admin/action';
import { setAvailableQuantity } from '@/server/shopify/admin';

export async function setStockAction(_state: ActionResult | null, form: FormData): Promise<ActionResult> {
  return runAction('inventory:write', async (user) => {
    const input = z
      .object({
        inventoryItemId: z.string().startsWith('gid://shopify/InventoryItem/'),
        locationId: z.string().startsWith('gid://shopify/Location/'),
        expectedCurrent: z.coerce.number().int(),
        quantity: z.coerce.number().int().min(0).max(100_000),
        reason: z.enum(['correction', 'received', 'damaged', 'restock', 'cycle_count_available']),
        label: z.string().max(300),
      })
      .parse(Object.fromEntries(form));
    if (input.quantity === input.expectedCurrent) return { ok: true, message: 'No change.' };
    await setAvailableQuantity({ ...input, referenceDocumentUri: `infnity://admin/inventory/${user.id}/${Date.now()}` });
    await audit({
      actor: actorOf(user),
      action: 'inventory.set',
      summary: `${input.label}: available ${input.expectedCurrent} → ${input.quantity} (${input.reason})`,
      targetType: 'inventory',
      targetId: input.inventoryItemId,
    });
    revalidateTag(CATALOG_CACHE_TAG, { expire: 0 });
    revalidatePath('/admin/inventory');
    return `Stock set to ${input.quantity}.`;
  });
}
