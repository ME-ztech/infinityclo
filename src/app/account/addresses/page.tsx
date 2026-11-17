import type { Metadata } from 'next';

import { AccountShell, FIELD, LABEL, SECONDARY_SUBMIT, SUBMIT, param, type SearchParams } from '@/components/account/AccountShell';
import { listAddresses, type CustomerAddress } from '@/server/commerce/customers';
import { requireCustomerPage } from '@/server/commerce/session';

import { deleteAddressAction, saveAddressAction } from '../actions';

export const metadata: Metadata = { title: 'Addresses', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

function AddressForm({ address }: { address?: CustomerAddress }) {
  const id = address?.id ?? 'new';
  const input = (name: keyof CustomerAddress & string, label: string, autoComplete: string, required = false) => (
    <div>
      <label htmlFor={`${id}-${name}`} className={LABEL}>
        {label}
      </label>
      <input
        id={`${id}-${name}`}
        name={name}
        autoComplete={autoComplete}
        required={required}
        defaultValue={(address?.[name] as string | null | undefined) ?? ''}
        className={FIELD}
      />
    </div>
  );
  return (
    <form action={saveAddressAction} className="grid gap-4 sm:grid-cols-2" data-testid={address ? 'address-edit-form' : 'address-new-form'}>
      {address && <input type="hidden" name="addressId" value={address.id} />}
      {input('firstName', 'First name', 'given-name', true)}
      {input('lastName', 'Last name', 'family-name', true)}
      <div className="sm:col-span-2">{input('line1', 'Address', 'address-line1', true)}</div>
      <div className="sm:col-span-2">{input('line2', 'Apartment, suite (optional)', 'address-line2')}</div>
      {input('city', 'City', 'address-level2', true)}
      {input('province', 'Province / state code (e.g. MB)', 'address-level1')}
      {input('postalCode', 'Postal / ZIP code', 'postal-code', true)}
      {input('country', 'Country code (e.g. CA)', 'country', true)}
      <div className="sm:col-span-2">{input('phone', 'Phone (optional)', 'tel')}</div>
      <label className="text-fg-muted flex items-center gap-3 text-sm sm:col-span-2">
        <input type="checkbox" name="isDefault" defaultChecked={address?.isDefault ?? false} className="h-4 w-4" />
        Use as my default address
      </label>
      <div className="sm:col-span-2">
        <button type="submit" className={SUBMIT}>
          {address ? 'Save changes' : 'Add address'}
        </button>
      </div>
    </form>
  );
}

export default async function AddressesPage({ searchParams }: { searchParams: SearchParams }) {
  const customer = await requireCustomerPage('/account/addresses');
  const params = await searchParams;
  const addresses = await listAddresses(customer.id);

  return (
    <AccountShell title="Addresses" current="/account/addresses" signedIn notice={param(params, 'notice')} error={param(params, 'error')}>
      <ul className="space-y-4" data-testid="address-list">
        {addresses.map((address) => (
          <li key={address.id} className="border-line border p-5">
            <details>
              <summary className="cursor-pointer text-sm">
                <span className="text-fg font-semibold">
                  {address.firstName} {address.lastName}
                </span>
                {address.isDefault && <span className="text-fg-muted ml-2 text-xs uppercase">Default</span>}
                <span className="text-fg-muted block">
                  {address.line1}, {address.city} {address.province} {address.postalCode}, {address.country}
                </span>
              </summary>
              <div className="mt-6">
                <AddressForm address={address} />
                <form action={deleteAddressAction} className="mt-4">
                  <input type="hidden" name="addressId" value={address.id} />
                  <button type="submit" className={SECONDARY_SUBMIT}>
                    Remove this address
                  </button>
                </form>
              </div>
            </details>
          </li>
        ))}
      </ul>

      <section className="mt-12" aria-labelledby="new-address-heading">
        <h2 id="new-address-heading" className="font-display text-fg mb-6 text-2xl">
          Add an address
        </h2>
        <AddressForm />
      </section>
    </AccountShell>
  );
}
