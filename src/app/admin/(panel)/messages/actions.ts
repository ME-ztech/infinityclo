'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { actorOf, runAction, type ActionResult } from '@/server/admin/action';
import { MESSAGE_STATUSES, updateMessage } from '@/server/messages';

export async function updateMessageAction(
  _state: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  return runAction('messages:write', async (user) => {
    const id = z.string().uuid().parse(form.get('id'));
    const status = z.enum(MESSAGE_STATUSES).parse(form.get('status'));
    const note = String(form.get('note') ?? '')
      .trim()
      .slice(0, 2000);
    await updateMessage(id, { status, note: note || undefined }, actorOf(user));
    revalidatePath(`/admin/messages/${id}`);
    revalidatePath('/admin/messages');
    return 'Updated.';
  });
}
