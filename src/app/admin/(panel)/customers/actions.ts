'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { audit } from '@/server/audit';
import { actorOf, runAction, type ActionResult } from '@/server/admin/action';
import { updateCustomerNoteAndTags } from '@/server/shopify/admin';

export async function updateCustomerAction(
  _state: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  return runAction('customers:write', async (user) => {
    const id = z.string().regex(/^\d+$/).parse(form.get('id'));
    const note = z
      .string()
      .max(5000)
      .parse(form.get('note') ?? '');
    const tags = String(form.get('tags') ?? '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 50);
    await updateCustomerNoteAndTags(id, note || null, tags);
    await audit({
      actor: actorOf(user),
      action: 'customer.note',
      summary: `Updated note/tags on customer ${id}`,
      targetType: 'customer',
      targetId: id,
    });
    revalidatePath(`/admin/customers/${id}`);
    return 'Saved to Shopify.';
  });
}
