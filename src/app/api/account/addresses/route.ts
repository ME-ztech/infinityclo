/**
 * Address book: create, update, delete and set-default, through the customer's
 * own token. An address id that is not the customer's is rejected by Shopify
 * and surfaced as an error — it is never resolved on this side.
 */
import type { NextRequest } from 'next/server';

import { fromResult, handleAccountMutation, parseAddressForm } from '@/server/customer/mutations';

export const dynamic = 'force-dynamic';

const ADDRESS_ID = /^\d{1,20}$/;

export function POST(request: NextRequest) {
  return handleAccountMutation(request, { scope: 'addresses', page: '/account/addresses' }, async ({ form, session, gateway }) => {
    const intent = String(form.get('intent') ?? 'create');
    const addressId = String(form.get('addressId') ?? '');
    const makeDefault = form.get('makeDefault') === 'yes';

    if (intent !== 'create' && !ADDRESS_ID.test(addressId)) {
      return { ok: false, errors: ['That address could not be found.'] };
    }
    if (intent === 'delete') {
      return fromResult(await gateway.deleteAddress(session.accessToken, addressId), 'Address removed.');
    }

    const parsed = parseAddressForm(form);
    if ('errors' in parsed) return { ok: false, errors: parsed.errors };

    if (intent === 'update') {
      return fromResult(await gateway.updateAddress(session.accessToken, addressId, parsed.input, makeDefault), 'Address updated.');
    }
    return fromResult(await gateway.createAddress(session.accessToken, parsed.input, makeDefault), 'Address added.');
  });
}
