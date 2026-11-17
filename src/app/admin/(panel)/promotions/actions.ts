'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { actorOf, runAction, type ActionResult } from '@/server/admin/action';
import { approve, deleteDraft, end, publish, saveDraft, setPaused } from '@/server/promotions';

const cents = (value: FormDataEntryValue | null) => {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const number = Number(text);
  if (!Number.isFinite(number) || number < 0) throw new Error(`"${text}" is not a valid amount.`);
  return Math.round(number * 100);
};
const num = (value: FormDataEntryValue | null) => {
  const text = String(value ?? '').trim();
  return text ? Number(text) : null;
};
const date = (value: FormDataEntryValue | null) => {
  const text = String(value ?? '').trim();
  return text ? new Date(`${text}${text.length === 16 ? ':00' : ''}`).toISOString() : null;
};

/** Builds a promotion config from the editor form; the domain schema validates it. */
function configFrom(form: FormData) {
  const kind = String(form.get('kind'));
  const base = {
    kind,
    title: String(form.get('title') ?? ''),
    method: form.get('method') === 'code' ? 'code' : 'automatic',
    code: String(form.get('code') ?? '')
      .trim()
      .toUpperCase(),
    startsAt: date(form.get('startsAt')),
    endsAt: date(form.get('endsAt')),
    usageLimit: num(form.get('usageLimit')),
    oncePerCustomer: form.get('oncePerCustomer') === 'on',
    scope: {
      type: form.get('scopeType') === 'products' ? 'products' : 'all',
      productHandles: String(form.get('productHandles') ?? '')
        .split(/[\s,]+/)
        .map((h) => h.trim())
        .filter(Boolean),
      excludeSaleItems: form.get('excludeSaleItems') === 'on',
    },
    combinesWith: {
      orderDiscounts: form.get('combineOrder') === 'on',
      productDiscounts: form.get('combineProduct') === 'on',
      shippingDiscounts: form.get('combineShipping') === 'on',
    },
  };
  if (kind === 'percentage') {
    return {
      ...base,
      percent: num(form.get('percent')),
      eligibility: form.get('eligibility') === 'first_order' ? 'first_order' : 'all',
      minimumSubtotalCents: cents(form.get('minimumSubtotal')),
    };
  }
  if (kind === 'bundle') {
    const type = form.get('valueType') === 'amount_off_order' ? 'amount_off_order' : 'percentage';
    return {
      ...base,
      minimumQuantity: num(form.get('minimumQuantity')) ?? 2,
      value:
        type === 'percentage'
          ? { type, percent: num(form.get('percent')) }
          : { type, amountCents: cents(form.get('amountOff')) },
    };
  }
  return {
    ...base,
    minimumSubtotalCents: cents(form.get('minimumSubtotal')) ?? 0,
    giftProductHandle: String(form.get('giftProductHandle') ?? '').trim(),
  };
}

function refresh(id?: string) {
  revalidatePath('/admin/promotions');
  if (id) revalidatePath(`/admin/promotions/${id}`);
}

export async function saveDraftAction(
  _state: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  return runAction('promotions:write', async (user) => {
    const id = form.get('id') ? z.string().uuid().parse(form.get('id')) : null;
    const name = z.string().trim().min(2).max(120).parse(form.get('name'));
    const saved = await saveDraft(id, name, configFrom(form), actorOf(user));
    refresh(saved);
    return {
      ok: true,
      message: 'Draft saved. Nothing is live until the owner approves and publishes it.',
      redirectTo: id ? undefined : `/admin/promotions/${saved}`,
    };
  });
}

export async function approveAction(
  _state: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  return runAction('promotions:approve', async (user) => {
    const id = z.string().uuid().parse(form.get('id'));
    await approve(id, form.get('margin') === 'on', actorOf(user));
    refresh(id);
    return 'Approved. Publish it to create the real Shopify discount.';
  });
}

export async function publishAction(
  _state: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  return runAction('promotions:approve', async (user) => {
    const id = z.string().uuid().parse(form.get('id'));
    await publish(id, actorOf(user));
    refresh(id);
    revalidatePath('/', 'layout');
    return 'Live: the Shopify discount exists and the storefront now shows this offer.';
  });
}

export async function pauseAction(
  _state: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  return runAction('promotions:approve', async (user) => {
    const id = z.string().uuid().parse(form.get('id'));
    const paused = form.get('paused') === 'true';
    await setPaused(id, paused, actorOf(user));
    refresh(id);
    revalidatePath('/', 'layout');
    return paused ? 'Paused in Shopify.' : 'Resumed in Shopify.';
  });
}

export async function endAction(
  _state: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  return runAction('promotions:approve', async (user) => {
    const id = z.string().uuid().parse(form.get('id'));
    await end(id, actorOf(user));
    refresh(id);
    revalidatePath('/', 'layout');
    return 'Ended.';
  });
}

export async function deleteDraftAction(
  _state: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  return runAction('promotions:write', async (user) => {
    const id = z.string().uuid().parse(form.get('id'));
    await deleteDraft(id, actorOf(user));
    refresh();
    return { ok: true, message: 'Draft deleted.', redirectTo: '/admin/promotions' };
  });
}
