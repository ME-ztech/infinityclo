'use server';

/**
 * Commerce actions: products, inventory, orders, customers.
 *
 * Each one runs inside `runAction`, which enforces same-origin, the permission,
 * the audit entry and the redirect. The bodies below only validate input and
 * call the gateway — the INFNITY database (or the sandbox) is where the change is persisted.
 */
import { revalidatePath, revalidateTag } from 'next/cache';

import { CATALOG_TAG } from '@/server/commerce/catalog';
import { htmlToText } from '@/domain/text';
import { checked, field, integer, list, priceCents, runAction } from '@/server/admin/action';
import {
  GatewayError,
  INVENTORY_REASONS,
  type CommerceGateway,
  type InventoryReason,
  type ProductInput,
  type ProductStatus,
  type VariantUpdate,
} from '@/server/admin/gateway';
import { SandboxAdminGateway } from '@/server/admin/sandbox';
import { logOrderNote, saveAdminSettings } from '@/server/admin/settings';
import { saveProductContent } from '@/server/cms';
import { shippedEmail, sendEmail } from '@/server/commerce/emails';
import { getOrder } from '@/server/commerce/orders';

function need(gateway: CommerceGateway | null): CommerceGateway {
  if (!gateway) throw new GatewayError('The commerce database is not configured, so this change cannot be saved.');
  return gateway;
}

/** Storefront pages that show catalogue data re-read it after a product write. */
function refreshCatalogue(handle?: string): void {
  revalidateTag(CATALOG_TAG, 'max');
  revalidatePath('/');
  revalidatePath('/shop');
  if (handle) revalidatePath(`/products/${handle}`);
}

const STATUSES: readonly ProductStatus[] = ['DRAFT', 'ACTIVE', 'ARCHIVED'];

/** Operator text -> escaped paragraphs. Markup typed into the box stays text. */
function textToHtml(text: string): string {
  const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escape(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function productInput(form: FormData, descriptionHtml: string): ProductInput {
  const title = field(form, 'title', 255);
  if (!title) throw new GatewayError('Give the product a title.');
  const status = field(form, 'status', 10) as ProductStatus;
  if (!STATUSES.includes(status)) throw new GatewayError('Choose a status.');
  return {
    title,
    descriptionHtml,
    productType: field(form, 'productType', 100),
    vendor: field(form, 'vendor', 100),
    tags: list(field(form, 'tags', 1000), 100),
    status,
    seoTitle: field(form, 'seoTitle', 70),
    seoDescription: field(form, 'seoDescription', 320),
  };
}

/* ------------------------------------------------------------------ *
 * Products
 * ------------------------------------------------------------------ */

export async function createProductAction(form: FormData): Promise<void> {
  await runAction({ permission: 'products.edit', action: 'product.create', back: '/admin/products/new', commerce: true }, async ({ gateway }) => {
    const options: Array<{ name: string; values: string[] }> = [];
    for (const index of [1, 2, 3]) {
      const name = field(form, `option${index}Name`, 40);
      const values = list(field(form, `option${index}Values`, 600), 30);
      if (name && values.length) options.push({ name, values });
      else if (name || values.length) throw new GatewayError(`Option ${index} needs both a name and at least one value.`);
    }
    if (new Set(options.map((option) => option.name.toLowerCase())).size !== options.length) {
      throw new GatewayError('Option names must be different from each other.');
    }
    const price = priceCents(form, 'price');
    if (price === null) throw new GatewayError('Enter a price, for example 45.00.');
    const compareRaw = field(form, 'compareAtPrice', 20);
    const compareAtPrice = compareRaw ? priceCents(form, 'compareAtPrice') : null;
    if (compareRaw && compareAtPrice === null) throw new GatewayError('The compare-at price is not a valid amount.');
    if (compareAtPrice !== null && compareAtPrice <= price) {
      throw new GatewayError('A compare-at price must be higher than the price, or left empty.');
    }

    const product = await need(gateway).createProduct({
      ...productInput(form, textToHtml(field(form, 'description', 8000))),
      options,
      price,
      compareAtPrice,
      skuPrefix: field(form, 'skuPrefix', 30).toUpperCase().replace(/[^A-Z0-9-]/g, '') || null,
    });
    refreshCatalogue(product.handle);
    return {
      to: `/admin/products/${product.id}`,
      message: `Created “${product.title}” as ${product.status}.`,
      target: `product:${product.id}`,
      detail: `Created ${product.handle} with ${product.variantCount} variant(s), status ${product.status}.`,
    };
  });
}

export async function updateProductAction(form: FormData): Promise<void> {
  const id = field(form, 'id', 80);
  await runAction({ permission: 'products.edit', action: 'product.update', back: `/admin/products/${id}`, commerce: true, target: `product:${id}` }, async ({ gateway }) => {
    const existing = await need(gateway).getProduct(id);
    if (!existing) throw new GatewayError('Product not found.');
    // Only replace the stored HTML when the operator actually changed the text,
    // so formatting authored in Shopify is not flattened by an unrelated save.
    const text = field(form, 'description', 8000);
    const unchanged = text === (htmlToText(existing.descriptionHtml) ?? '');
    const product = await need(gateway).updateProduct(id, productInput(form, unchanged ? existing.descriptionHtml : textToHtml(text)));
    refreshCatalogue(product.handle);
    return { message: 'Product saved.', detail: `Updated ${product.handle}; status ${product.status}.` };
  });
}

export async function updateVariantsAction(form: FormData): Promise<void> {
  const id = field(form, 'id', 80);
  await runAction({ permission: 'products.edit', action: 'product.variants', back: `/admin/products/${id}#variants`, commerce: true, target: `product:${id}` }, async ({ gateway }) => {
    const ids = form.getAll('variantId').filter((value): value is string => typeof value === 'string').slice(0, 100);
    const updates: VariantUpdate[] = ids.map((variantId) => {
      const price = priceCents(form, `price:${variantId}`);
      if (price === null) throw new GatewayError('Every variant needs a valid price.');
      const compareRaw = field(form, `compare:${variantId}`, 20);
      const compareAtPrice = compareRaw ? priceCents(form, `compare:${variantId}`) : null;
      if (compareRaw && (compareAtPrice === null || compareAtPrice <= price)) {
        throw new GatewayError('A compare-at price must be a valid amount higher than the price, or left empty.');
      }
      const weightRaw = field(form, `weight:${variantId}`, 10);
      const weight = weightRaw ? integer(form, `weight:${variantId}`) : null;
      if (weightRaw && (weight === null || weight < 0 || weight > 100000)) throw new GatewayError('Weight is in whole grams.');
      return {
        id: variantId,
        price,
        compareAtPrice,
        sku: field(form, `sku:${variantId}`, 60) || null,
        barcode: field(form, `barcode:${variantId}`, 60) || null,
        weightGrams: weight,
      };
    });
    await need(gateway).updateVariants(id, updates);
    const product = await need(gateway).getProduct(id);
    refreshCatalogue(product?.handle);
    return { message: `Saved ${updates.length} variant(s).`, detail: `Variant prices/SKUs updated (${updates.length}).` };
  });
}

export async function setProductStatusAction(form: FormData): Promise<void> {
  const id = field(form, 'id', 80);
  await runAction({ permission: 'products.edit', action: 'product.status', back: `/admin/products/${id}`, commerce: true, target: `product:${id}` }, async ({ gateway }) => {
    const status = field(form, 'status', 10) as ProductStatus;
    if (!STATUSES.includes(status)) throw new GatewayError('Unknown status.');
    if (status === 'ARCHIVED' && field(form, 'confirm', 20) !== 'ARCHIVE') throw new GatewayError('Type ARCHIVE to confirm.');
    const product = await need(gateway).getProduct(id);
    if (!product) throw new GatewayError('Product not found.');
    await need(gateway).setProductStatus(id, status);
    refreshCatalogue(product.handle);
    const verb = { ACTIVE: 'published', DRAFT: 'moved to draft', ARCHIVED: 'archived' }[status];
    return { message: `“${product.title}” ${verb}.`, detail: `Status ${product.status} -> ${status}.` };
  });
}

export async function duplicateProductAction(form: FormData): Promise<void> {
  const id = field(form, 'id', 80);
  await runAction({ permission: 'products.edit', action: 'product.duplicate', back: `/admin/products/${id}`, commerce: true, target: `product:${id}` }, async ({ gateway }) => {
    const title = field(form, 'newTitle', 255);
    if (!title) throw new GatewayError('Give the copy a title.');
    const copy = await need(gateway).duplicateProduct(id, title);
    return { to: `/admin/products/${copy.id}`, message: `Duplicated as a draft: “${copy.title}”.`, detail: `Duplicated to ${copy.id} (DRAFT).` };
  });
}

export async function addProductImageAction(form: FormData): Promise<void> {
  const id = field(form, 'id', 80);
  await runAction({ permission: 'products.edit', action: 'product.image', back: `/admin/products/${id}#media`, commerce: true, target: `product:${id}` }, async ({ gateway }) => {
    const url = field(form, 'imageUrl', 500);
    const allowed = /^https:\/\/[^\s"'<>]+\.(?:jpe?g|png|webp)(?:\?[^\s"'<>]*)?$/i.test(url) || /^\/[\w./-]+\.(?:jpe?g|png|webp)$/i.test(url);
    if (!allowed) throw new GatewayError('Enter an https:// link to a JPG, PNG or WebP image.');
    const alt = field(form, 'imageAlt', 200);
    if (!alt) throw new GatewayError('Describe the image for customers using screen readers.');
    await need(gateway).addProductImage(id, url, alt);
    const product = await need(gateway).getProduct(id);
    refreshCatalogue(product?.handle);
    return { message: 'Image added.', detail: 'Added one image by URL.' };
  });
}

export async function saveProductContentAction(form: FormData): Promise<void> {
  const id = field(form, 'id', 80);
  await runAction({ permission: 'products.edit', action: 'product.content', back: `/admin/products/${id}#content`, target: `product:${id}` }, async ({ session }) => {
    const slug = field(form, 'slug', 120);
    if (!/^[a-z0-9-]+$/.test(slug)) throw new Error('This product has no storefront handle yet.');
    await saveProductContent(
      slug,
      { fit: field(form, 'fit', 1200), fabric: field(form, 'fabric', 1200), care: field(form, 'care', 1200), sizeChart: field(form, 'sizeChart', 40) },
      session.email,
    );
    revalidatePath(`/products/${slug}`);
    return { message: 'Fit, fabric, care and size chart saved.', detail: `PDP content saved for ${slug}.` };
  });
}

/* ------------------------------------------------------------------ *
 * Inventory
 * ------------------------------------------------------------------ */

export async function setInventoryAction(form: FormData): Promise<void> {
  const item = field(form, 'inventoryItemId', 80);
  await runAction({ permission: 'inventory.edit', action: 'inventory.set', back: field(form, 'back', 200) || '/admin/inventory', commerce: true, target: `inventory:${item}` }, async ({ gateway }) => {
    const quantity = integer(form, 'quantity');
    const expected = integer(form, 'expected');
    const reason = field(form, 'reason', 20) as InventoryReason;
    if (quantity === null || quantity < 0 || quantity > 1_000_000) throw new GatewayError('Enter a quantity of zero or more.');
    if (expected === null) throw new GatewayError('Reload the page and try again.');
    if (!(reason in INVENTORY_REASONS)) throw new GatewayError('Choose a reason for the change.');
    if (quantity === expected) return { message: 'No change: the quantity is already that number.' };
    await need(gateway).setInventory({ inventoryItemId: item, locationId: field(form, 'locationId', 80), quantity, expectedQuantity: expected, reason });
    refreshCatalogue();
    return { message: `Stock set to ${quantity}.`, detail: `Available ${expected} -> ${quantity} (${reason}).` };
  });
}

export async function saveThresholdAction(form: FormData): Promise<void> {
  await runAction({ permission: 'settings.edit', action: 'settings.threshold', back: field(form, 'back', 200) || '/admin/settings' }, async () => {
    const settings = await saveAdminSettings({ lowStockThreshold: field(form, 'lowStockThreshold', 6) });
    return { message: `Low-stock threshold set to ${settings.lowStockThreshold}.` };
  });
}

/* ------------------------------------------------------------------ *
 * Orders
 * ------------------------------------------------------------------ */

export async function saveOrderNoteAction(form: FormData): Promise<void> {
  const id = field(form, 'id', 80);
  await runAction({ permission: 'orders.edit', action: 'order.note', back: `/admin/orders/${id}#notes`, commerce: true, target: `order:${id}` }, async ({ gateway, session }) => {
    const note = field(form, 'note', 2000);
    await need(gateway).updateOrderNote(id, note);
    await logOrderNote({ orderId: id, by: session.email, text: note || '(note cleared)', kind: 'note' });
    return { message: 'Internal note saved.', detail: 'Order note updated.' };
  });
}

export async function fulfillOrderAction(form: FormData): Promise<void> {
  const id = field(form, 'id', 80);
  await runAction({ permission: 'orders.edit', action: 'order.fulfil', back: `/admin/orders/${id}`, commerce: true, target: `order:${id}` }, async ({ gateway, session }) => {
    if (field(form, 'confirm', 20) !== 'FULFIL') throw new GatewayError('Type FULFIL to confirm.');
    const trackingNumber = field(form, 'trackingNumber', 80) || null;
    const trackingUrl = field(form, 'trackingUrl', 300) || null;
    if (trackingUrl && !/^https:\/\/[^\s]+$/i.test(trackingUrl)) throw new GatewayError('The tracking link must start with https://');
    if (trackingUrl && !trackingNumber) throw new GatewayError('Add the tracking number that goes with the tracking link.');
    const notifyCustomer = checked(form, 'notifyCustomer');
    const backend = need(gateway);
    await backend.fulfillOrder(id, { trackingNumber, trackingCompany: field(form, 'trackingCompany', 60) || null, trackingUrl, notifyCustomer });
    const summary = trackingNumber ? `Fulfilled with tracking ${trackingNumber}.` : 'Fulfilled without tracking.';

    // The shipping email is sent here, once, for the shipment just recorded.
    let notice = '';
    if (notifyCustomer && backend.mode === 'native') {
      const detail = await getOrder(id);
      const shipment = detail?.fulfillments.at(-1);
      const sent = detail && shipment && detail.order.email ? await sendEmail(shippedEmail(detail, shipment)) : false;
      notice = sent ? ' Shipping email sent to the customer.' : ' The shipping email was NOT sent: no email provider is connected.';
    } else if (notifyCustomer) {
      notice = ' No email was sent: the sandbox never contacts customers.';
    }
    await logOrderNote({ orderId: id, by: session.email, text: `${summary}${notice}`, kind: 'fulfilment' });
    revalidatePath('/account/orders');
    return { message: `${summary}${notice}`, detail: summary };
  });
}

export async function createTestOrderAction(): Promise<void> {
  await runAction({ permission: 'orders.edit', action: 'order.test_create', back: '/admin/orders', commerce: true }, async ({ gateway }) => {
    if (!(gateway instanceof SandboxAdminGateway)) throw new GatewayError('Test orders can only be created in the sandbox.');
    const order = await gateway.createTestOrder();
    return { to: `/admin/orders/${order.id}`, message: `Created ${order.name}, a TEST order in the sandbox.`, target: `order:${order.id}` };
  });
}

/* ------------------------------------------------------------------ *
 * Customers
 * ------------------------------------------------------------------ */

export async function updateCustomerAction(form: FormData): Promise<void> {
  const id = field(form, 'id', 80);
  await runAction({ permission: 'customers.edit', action: 'customer.update', back: `/admin/customers/${id}`, commerce: true, target: `customer:${id}` }, async ({ gateway }) => {
    await need(gateway).updateCustomer(id, { note: field(form, 'note', 5000), tags: list(field(form, 'tags', 1000), 100) });
    return { message: 'Customer note and tags saved.', detail: 'Note/tags updated.' };
  });
}
