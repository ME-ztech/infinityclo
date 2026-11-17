'use server';

/**
 * Shipping-rate and tax-rate actions. Owner-only (`settings.edit`): these are
 * the numbers every order is charged with.
 */
import { revalidatePath } from 'next/cache';

import { checked, field, runAction } from '@/server/admin/action';
import {
  createShippingRate,
  createTaxRate,
  deleteShippingRate,
  deleteTaxRate,
  updateShippingRate,
  updateTaxRate,
} from '@/server/admin/rates';

const shippingFields = (form: FormData) => ({
  name: field(form, 'name', 80),
  countries: field(form, 'countries', 600),
  provinces: field(form, 'provinces', 600),
  price: field(form, 'price', 20),
  freeOver: field(form, 'freeOver', 20),
  deliveryEstimate: field(form, 'deliveryEstimate', 120),
  position: field(form, 'position', 6),
  active: checked(form, 'active'),
});

const taxFields = (form: FormData) => ({
  country: field(form, 'country', 2),
  province: field(form, 'province', 3),
  name: field(form, 'name', 40),
  rate: field(form, 'rate', 12),
  appliesToShipping: checked(form, 'appliesToShipping'),
  active: checked(form, 'active'),
});

function refreshCheckout(): void {
  revalidatePath('/checkout');
  revalidatePath('/cart');
}

export async function createShippingRateAction(form: FormData): Promise<void> {
  await runAction({ permission: 'settings.edit', action: 'shipping_rate.create', back: '/admin/settings#shipping' }, async () => {
    const rate = await createShippingRate(shippingFields(form));
    refreshCheckout();
    return { message: `Shipping rate “${rate.name}” added.`, target: `shipping_rate:${rate.id}`, detail: `${rate.name}: ${rate.priceCents} cents to ${rate.countries.join(',')}.` };
  });
}

export async function updateShippingRateAction(form: FormData): Promise<void> {
  const id = field(form, 'id', 80);
  await runAction({ permission: 'settings.edit', action: 'shipping_rate.update', back: '/admin/settings#shipping', target: `shipping_rate:${id}` }, async () => {
    const rate = await updateShippingRate(id, shippingFields(form));
    refreshCheckout();
    return { message: `Shipping rate “${rate.name}” saved.`, detail: `${rate.name}: ${rate.priceCents} cents; active ${rate.active}.` };
  });
}

export async function deleteShippingRateAction(form: FormData): Promise<void> {
  const id = field(form, 'id', 80);
  await runAction({ permission: 'settings.edit', action: 'shipping_rate.delete', back: '/admin/settings#shipping', target: `shipping_rate:${id}` }, async () => {
    if (field(form, 'confirm', 20) !== 'DELETE') throw new Error('Type DELETE to confirm.');
    await deleteShippingRate(id);
    refreshCheckout();
    return { message: 'Shipping rate deleted. If it was the last active one, checkout is now closed.' };
  });
}

export async function createTaxRateAction(form: FormData): Promise<void> {
  await runAction({ permission: 'settings.edit', action: 'tax_rate.create', back: '/admin/settings#tax' }, async () => {
    const rate = await createTaxRate(taxFields(form));
    refreshCheckout();
    return { message: `Tax rate “${rate.name}” added.`, target: `tax_rate:${rate.id}`, detail: `${rate.name} ${rate.rateBps}bps for ${rate.country}${rate.province ? `-${rate.province}` : ''}.` };
  });
}

export async function updateTaxRateAction(form: FormData): Promise<void> {
  const id = field(form, 'id', 80);
  await runAction({ permission: 'settings.edit', action: 'tax_rate.update', back: '/admin/settings#tax', target: `tax_rate:${id}` }, async () => {
    const rate = await updateTaxRate(id, taxFields(form));
    refreshCheckout();
    return { message: `Tax rate “${rate.name}” saved.`, detail: `${rate.name} ${rate.rateBps}bps; active ${rate.active}.` };
  });
}

export async function deleteTaxRateAction(form: FormData): Promise<void> {
  const id = field(form, 'id', 80);
  await runAction({ permission: 'settings.edit', action: 'tax_rate.delete', back: '/admin/settings#tax', target: `tax_rate:${id}` }, async () => {
    if (field(form, 'confirm', 20) !== 'DELETE') throw new Error('Type DELETE to confirm.');
    await deleteTaxRate(id);
    refreshCheckout();
    return { message: 'Tax rate deleted.' };
  });
}
