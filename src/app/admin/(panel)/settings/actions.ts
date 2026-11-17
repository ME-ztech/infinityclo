'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { DEFAULT_SETTINGS } from '@/domain/settings';
import { ROLES } from '@/domain/rbac';
import { actorOf, runAction, type ActionResult } from '@/server/admin/action';
import { createStaffUser, updateStaff } from '@/server/auth/staff';
import { saveSettings } from '@/server/content/cms';

export async function saveSettingsAction(_state: ActionResult | null, form: FormData): Promise<ActionResult> {
  return runAction('settings:write', async (user) => {
    const text = (key: string) => String(form.get(key) ?? '').trim();
    await saveSettings(
      {
        brandName: text('brandName') || DEFAULT_SETTINGS.brandName,
        tradeName: text('tradeName') || DEFAULT_SETTINGS.tradeName,
        publicEmail: text('publicEmail'),
        publicPhone: text('publicPhone'),
        notificationEmail: text('notificationEmail'),
        instagramHandle: text('instagramHandle').replace(/^@/, ''),
        facebookUrl: text('facebookUrl'),
        threadsHandle: text('threadsHandle').replace(/^@/, ''),
        cartUpsellEnabled: form.get('cartUpsellEnabled') === 'on',
        pdpRecommendationsEnabled: form.get('pdpRecommendationsEnabled') === 'on',
        newsletterDoubleOptIn: form.get('newsletterDoubleOptIn') === 'on',
        lowStockThreshold: Number(text('lowStockThreshold') || 5),
      },
      actorOf(user),
    );
    revalidatePath('/', 'layout');
    return 'Settings saved and live.';
  });
}

export async function createStaffAction(_state: ActionResult | null, form: FormData): Promise<ActionResult> {
  return runAction('staff:manage', async (user) => {
    const input = z
      .object({ email: z.string().email(), name: z.string().trim().min(1).max(80), role: z.enum(ROLES), password: z.string().min(12).max(200) })
      .parse(Object.fromEntries(form));
    await createStaffUser(input, user);
    revalidatePath('/admin/settings');
    return `Created ${input.email}. Share the temporary password privately and ask them to change it.`;
  });
}

export async function updateStaffAction(_state: ActionResult | null, form: FormData): Promise<ActionResult> {
  return runAction('staff:manage', async (user) => {
    const id = z.string().uuid().parse(form.get('id'));
    const intent = String(form.get('intent'));
    if (id === user.id && intent !== 'password') throw new Error('You can’t change your own role or deactivate yourself.');
    if (intent === 'role') await updateStaff(id, { role: z.enum(ROLES).parse(form.get('role')) }, user);
    else if (intent === 'deactivate') await updateStaff(id, { active: false }, user);
    else if (intent === 'activate') await updateStaff(id, { active: true }, user);
    else if (intent === 'password') await updateStaff(id, { password: z.string().min(12).parse(form.get('password')) }, user);
    else throw new Error('Unknown action.');
    revalidatePath('/admin/settings');
    return 'Updated. Their existing sessions were signed out.';
  });
}
