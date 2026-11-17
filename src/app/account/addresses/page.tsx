import type { Metadata } from 'next';

import { AccountShell, SECONDARY_SUBMIT, SUBMIT, Unavailable } from '@/components/account/AccountShell';
import { AddressFields } from '@/components/account/AddressFields';
import { GuestAccount } from '@/components/account/GuestAccount';
import { accountContext, loadForPage } from '@/server/customer/context';
import { readFlash } from '@/server/customer/session';

export const metadata: Metadata = { title: 'Addresses' };

const PAGE = '/account/addresses';
const ACTION = '/api/account/addresses';

/**
 * Address book. Every form posts to the account API, which writes through the
 * customer's own Shopify token; this page only ever lists what Shopify returns
 * for that token.
 */
export default async function AddressesPage() {
  const context = await accountContext(PAGE);
  if (context.state !== 'signed_in') return <GuestAccount title="Addresses" current={PAGE} context={context} />;

  const loaded = await loadForPage(PAGE, () => context.gateway.listAddresses(context.session.accessToken));
  if ('error' in loaded) {
    return (
      <AccountShell title="Addresses" current={PAGE} signedIn>
        <Unavailable message={loaded.error} />
      </AccountShell>
    );
  }

  const addresses = loaded.data;
  const flash = await readFlash();

  return (
    <AccountShell title="Addresses" current={PAGE} signedIn notice={flash.notice} error={flash.error}>
      {addresses.length === 0 ? (
        <p className="border-line text-fg-muted border p-6 text-sm">You have no saved addresses.</p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2" data-testid="address-list">
          {addresses.map((address) => (
            <li key={address.id} className="border-line border p-5 text-sm">
              {address.isDefault && (
                <p className="text-fg mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.16em]">Default address</p>
              )}
              <address className="text-fg-muted not-italic leading-relaxed">
                {address.formatted.map((line, index) => (
                  <span key={index} className="block">
                    {line}
                  </span>
                ))}
                {address.phoneNumber && <span className="block">{address.phoneNumber}</span>}
              </address>

              <details className="mt-4">
                <summary className="text-fg cursor-pointer text-xs font-semibold uppercase tracking-[0.16em]">Edit</summary>
                <form action={ACTION} method="post" className="mt-4 space-y-4">
                  <input type="hidden" name="intent" value="update" />
                  <input type="hidden" name="addressId" value={address.id} />
                  <AddressFields prefix={`edit-${address.id}`} address={address} />
                  {!address.isDefault && (
                    <label className="text-fg-muted flex items-center gap-2 text-sm">
                      <input type="checkbox" name="makeDefault" value="yes" className="h-4 w-4" />
                      Make this my default address
                    </label>
                  )}
                  <button type="submit" className={SUBMIT}>
                    Save address
                  </button>
                </form>
              </details>

              <form action={ACTION} method="post" className="mt-3">
                <input type="hidden" name="intent" value="delete" />
                <input type="hidden" name="addressId" value={address.id} />
                <button type="submit" className="text-fg-muted hover:text-signal cursor-pointer text-xs font-semibold uppercase tracking-[0.16em]">
                  Remove<span className="sr-only"> address {address.formatted[0] ?? ''}</span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <section className="border-line mt-10 border p-6 md:p-8" aria-labelledby="add-address">
        <h2 id="add-address" className="font-display text-fg mb-6 text-xl">
          Add an address
        </h2>
        <form action={ACTION} method="post" className="space-y-4">
          <input type="hidden" name="intent" value="create" />
          <AddressFields prefix="new" />
          <label className="text-fg-muted flex items-center gap-2 text-sm">
            <input type="checkbox" name="makeDefault" value="yes" className="h-4 w-4" />
            Make this my default address
          </label>
          <button type="submit" className={addresses.length === 0 ? SUBMIT : SECONDARY_SUBMIT}>
            Add address
          </button>
        </form>
      </section>
    </AccountShell>
  );
}
