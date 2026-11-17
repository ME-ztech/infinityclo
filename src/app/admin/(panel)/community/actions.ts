'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { imageUrlSchema } from '@/domain/cms';
import { actorOf, runAction, type ActionResult } from '@/server/admin/action';
import { moderate } from '@/server/community';

export async function moderateAction(
  _state: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  return runAction('community:moderate', async (user) => {
    const id = z.string().max(80).parse(form.get('id'));
    const status = z.enum(['approved', 'hidden', 'rejected', 'pending']).parse(form.get('status'));
    const imageUrl = String(form.get('imageUrl') ?? '').trim();
    await moderate(
      id,
      {
        status,
        alt: z
          .string()
          .trim()
          .min(3, 'Describe the photo for screen readers')
          .max(200)
          .parse(form.get('alt')),
        handle:
          String(form.get('handle') ?? '')
            .trim()
            .replace(/^@/, '') || null,
        caption: String(form.get('caption') ?? '').trim() || null,
        productSlugs: String(form.get('productSlugs') ?? '')
          .split(/[\s,]+/)
          .filter(Boolean),
        note: String(form.get('note') ?? '').trim() || null,
        imageUrl: imageUrl ? imageUrlSchema.parse(imageUrl) : null,
      },
      actorOf(user),
    );
    revalidatePath('/admin/community');
    revalidatePath('/styled-by-you');
    revalidatePath('/');
    return `Post ${status}.`;
  });
}
