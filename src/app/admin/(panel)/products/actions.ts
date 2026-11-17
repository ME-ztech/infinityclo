'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { z } from 'zod';

import { CATALOG_CACHE_TAG } from '@/data/adapters/shopify/catalog';
import { audit } from '@/server/audit';
import { actorOf, runAction, type ActionResult } from '@/server/admin/action';
import {
  duplicateProduct,
  saveProduct,
  setProductStatus,
  setPublished,
  uploadImage,
} from '@/server/shopify/admin';

const money = z
  .string()
  .trim()
  .regex(/^\d{1,6}(\.\d{1,2})?$/, 'Use a price like 45 or 45.00');

const productSchema = z.object({
  id: z.string().nullable(),
  title: z.string().trim().min(1, 'Add a title').max(255),
  handle: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]*$/, 'Handles use lowercase letters, numbers and dashes')
    .max(255)
    .nullable(),
  description: z.string().max(20_000),
  productType: z.string().trim().max(255),
  vendor: z.string().trim().max(255),
  status: z.enum(['ACTIVE', 'DRAFT', 'ARCHIVED']),
  tags: z.array(z.string().trim().min(1).max(255)).max(250),
  seoTitle: z.string().trim().max(70).nullable(),
  seoDescription: z.string().trim().max(320).nullable(),
  options: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(255),
        values: z.array(z.string().trim().min(1).max(255)).min(1),
      }),
    )
    .min(1)
    .max(3),
  variants: z
    .array(
      z.object({
        id: z.string().nullable(),
        optionValues: z.array(z.object({ optionName: z.string(), name: z.string() })),
        price: money,
        compareAtPrice: money.nullable(),
        sku: z.string().trim().max(255).nullable(),
        barcode: z.string().trim().max(255).nullable(),
        weightGrams: z.number().int().min(0).max(100_000).nullable(),
        initialQuantity: z.number().int().min(0).max(100_000).nullable().optional(),
      }),
    )
    .min(1, 'Add at least one variant')
    .max(100),
  newMedia: z
    .array(
      z.object({
        url: z.string().url().startsWith('https://'),
        alt: z.string().trim().min(3, 'Describe each new image').max(512),
      }),
    )
    .max(20),
  facts: z.object({
    fit: z.string().nullable(),
    fabric: z.string().nullable(),
    care: z.string().nullable(),
    sizeGuide: z.string().nullable(),
  }),
  publicationIds: z.array(z.string()),
  initialLocationId: z.string().nullable(),
});

function toHtml(text: string): string {
  const escape = (value: string) =>
    value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escape(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function refreshStorefront(handle?: string) {
  revalidateTag(CATALOG_CACHE_TAG, { expire: 0 });
  revalidatePath('/shop');
  revalidatePath('/');
  if (handle) revalidatePath(`/products/${handle}`);
}

export async function saveProductAction(
  _state: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  // The clicked button decides the status: "Save as draft" or "Save & publish".
  const requested = form.get('$status') === 'ACTIVE' ? 'ACTIVE' : 'DRAFT';
  return runAction(requested === 'ACTIVE' ? 'products:publish' : 'products:write', async (user) => {
    const parsed = productSchema.parse(JSON.parse(String(form.get('payload') ?? '{}')));
    const input = {
      ...parsed,
      status: requested,
      publicationIds: requested === 'ACTIVE' ? parsed.publicationIds : [],
    } as const;
    // A variant with a compare-at price at or below its price is not a sale; refuse it rather than show a false discount.
    for (const variant of input.variants) {
      if (variant.compareAtPrice && Number(variant.compareAtPrice) <= Number(variant.price)) {
        throw new Error(
          `Compare-at price must be higher than the price (${variant.optionValues.map((v) => v.name).join(' / ')}), or left blank.`,
        );
      }
    }
    const saved = await saveProduct({
      id: input.id,
      title: input.title,
      handle: input.handle || null,
      descriptionHtml: toHtml(input.description),
      productType: input.productType,
      vendor: input.vendor,
      status: input.status,
      tags: input.tags,
      seoTitle: input.seoTitle,
      seoDescription: input.seoDescription,
      options: input.options,
      variants: input.variants,
      newMedia: input.newMedia,
      facts: input.facts,
      initialLocationId: input.initialLocationId,
    });
    if (input.publicationIds.length) await setPublished(saved.id, input.publicationIds, true);
    await audit({
      actor: actorOf(user),
      action: input.id ? 'product.update' : 'product.create',
      summary: `${input.id ? 'Updated' : 'Created'} product "${input.title}" (${input.status})${input.publicationIds.length ? ' and published to sales channels' : ''}`,
      targetType: 'product',
      targetId: saved.id,
      metadata: { handle: saved.handle, variants: input.variants.length, status: input.status },
    });
    refreshStorefront(saved.handle);
    const numericId = saved.id.split('/').pop();
    return {
      ok: true,
      message: `Saved to Shopify (${input.status.toLowerCase()}).`,
      redirectTo: input.id ? undefined : `/admin/products/${numericId}`,
    };
  });
}

export async function setStatusAction(
  _state: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  return runAction('products:publish', async (user) => {
    const id = z.string().regex(/^\d+$/).parse(form.get('id'));
    const status = z.enum(['ACTIVE', 'DRAFT', 'ARCHIVED']).parse(form.get('status'));
    await setProductStatus(id, status);
    await audit({
      actor: actorOf(user),
      action: 'product.status',
      summary: `Set product ${id} to ${status}`,
      targetType: 'product',
      targetId: id,
    });
    refreshStorefront();
    return `Product is now ${status.toLowerCase()}.`;
  });
}

export async function duplicateAction(
  _state: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  return runAction('products:write', async (user) => {
    const id = z.string().regex(/^\d+$/).parse(form.get('id'));
    const title = z.string().trim().min(1).max(255).parse(form.get('title'));
    const created = await duplicateProduct(id, title);
    await audit({
      actor: actorOf(user),
      action: 'product.duplicate',
      summary: `Duplicated product ${id} as draft "${title}"`,
      targetType: 'product',
      targetId: created?.id ?? id,
    });
    return {
      ok: true,
      message: 'Duplicated as a draft.',
      redirectTo: created ? `/admin/products/${created.id.split('/').pop()}` : undefined,
    };
  });
}

/** Uploads one image to Shopify Files (CDN) and returns its URL for the editor. */
export async function uploadImageAction(form: FormData): Promise<{ url?: string; error?: string }> {
  const result = await runAction('products:write', async () => {
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) throw new Error('Choose an image.');
    if (file.size > 20 * 1024 * 1024) throw new Error('Images must be 20 MB or smaller.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
      throw new Error('Use JPEG, PNG or WebP.');
    const url = await uploadImage({
      name: file.name.replace(/[^\w.-]/g, '_'),
      type: file.type,
      size: file.size,
      bytes: await file.arrayBuffer(),
    });
    return { ok: true, message: url };
  });
  return result.ok ? { url: result.message } : { error: result.error };
}
