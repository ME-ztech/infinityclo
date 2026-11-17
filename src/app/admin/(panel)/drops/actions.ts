'use server';

import { revalidatePath } from 'next/cache';

import { actorOf, runAction, type ActionResult } from '@/server/admin/action';
import { saveDrop } from '@/server/drops';

const opt = (value: FormDataEntryValue | null) => {
  const text = String(value ?? '').trim();
  return text ? text : null;
};

export async function saveDropAction(_state: ActionResult | null, form: FormData): Promise<ActionResult> {
  return runAction('drops:write', async (user) => {
    const id = opt(form.get('id'));
    const releaseLocal = opt(form.get('releaseAt'));
    await saveDrop(
      id,
      {
        slug: String(form.get('slug') ?? ''),
        name: String(form.get('name') ?? ''),
        status: String(form.get('status') ?? 'draft') as never,
        headline: opt(form.get('headline')),
        body: opt(form.get('body')),
        mediaUrl: opt(form.get('mediaUrl')),
        mediaAlt: opt(form.get('mediaAlt')),
        releaseAt: releaseLocal ? new Date(`${releaseLocal}:00-06:00`).toISOString() : null,
        releaseConfirmed: form.get('releaseConfirmed') === 'on',
        shopifyProductHandle: opt(form.get('shopifyProductHandle')),
        waitlistEnabled: form.get('waitlistEnabled') === 'on',
      },
      actorOf(user),
    );
    revalidatePath('/admin/drops');
    revalidatePath('/coming-soon');
    revalidatePath('/');
    return 'Drop saved.';
  });
}
