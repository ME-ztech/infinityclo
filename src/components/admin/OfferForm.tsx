import type { Offer, OfferStatus } from '@/domain/offers';
import { CATEGORY_GROUPS } from '@/domain/taxonomy';

import { Checkbox, SelectField, TextArea, TextField } from './ui';

export const OFFER_STATUS: Record<OfferStatus, { label: string; tone: 'neutral' | 'good' | 'warn' | 'bad' }> = {
  draft: { label: 'Draft — not live', tone: 'neutral' },
  live: { label: 'Live', tone: 'good' },
  paused: { label: 'Paused', tone: 'warn' },
  ended: { label: 'Ended', tone: 'bad' },
};

/**
 * `datetime-local` wants `YYYY-MM-DDTHH:mm` in the same clock the server will
 * parse it back in, so the value is formatted with the server's local getters
 * and round-trips exactly.
 */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export interface OfferProductOption {
  readonly slug: string;
  readonly name: string;
}

/**
 * The fields of an offer. Names match `offerInput` in
 * `src/app/admin/actions/local.ts` exactly. Rendered inside a <form> by the
 * new-offer and edit-offer pages; `disabled` shows a live offer read-only.
 */
export function OfferFields({ offer, products, disabled }: { offer?: Offer; products: readonly OfferProductOption[]; disabled?: boolean }) {
  const scope = offer?.eligibility.scope ?? 'all';
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <TextField label="Title" name="title" required maxLength={120} defaultValue={offer?.title ?? ''} disabled={disabled} wrapClass="md:col-span-2" hint="Shown to customers at checkout when the offer applies." data-testid="offer-title" />

      <SelectField
        label="Kind"
        name="kind"
        defaultValue={offer?.kind ?? 'percentage'}
        disabled={disabled}
        data-testid="offer-kind"
        options={[
          { value: 'percentage', label: 'Percentage off' },
          { value: 'bundle', label: 'Bundle — percentage off when buying N or more' },
        ]}
        hint="A bundle is always applied automatically; it cannot use a code."
      />
      <TextField label="Percent off" name="percentOff" required inputMode="numeric" pattern="\d{1,2}" defaultValue={offer?.percentOff ?? ''} disabled={disabled} hint="A whole number from 1 to 90." data-testid="offer-percent" />

      <SelectField
        label="How it is applied"
        name="method"
        defaultValue={offer?.method ?? 'code'}
        disabled={disabled}
        data-testid="offer-method"
        options={[
          { value: 'code', label: 'Customer enters a code' },
          { value: 'automatic', label: 'Automatically at checkout' },
        ]}
      />
      <TextField label="Code" name="code" maxLength={32} defaultValue={offer?.code ?? ''} disabled={disabled} hint="3–32 characters: capital letters, numbers, hyphen or underscore. Ignored for automatic offers." data-testid="offer-code" />

      <TextField label="Bundle minimum quantity" name="minQuantity" inputMode="numeric" pattern="\d{1,2}" defaultValue={offer?.minQuantity ?? ''} disabled={disabled} hint="Bundles only: eligible items needed before the saving applies (2–20)." />
      <SelectField
        label="Who can use it"
        name="audience"
        defaultValue={offer?.audience ?? 'everyone'}
        disabled={disabled}
        options={[
          { value: 'everyone', label: 'Everyone' },
          { value: 'first_order', label: 'First order only (needs a code)' },
        ]}
      />

      <fieldset className="border border-neutral-200 p-4 md:col-span-2">
        <legend className="px-1 text-xs font-bold tracking-wide uppercase">Eligible items</legend>
        <SelectField
          label="Applies to"
          name="scope"
          defaultValue={scope}
          disabled={disabled}
          options={[
            { value: 'all', label: 'Every product' },
            { value: 'categories', label: 'Chosen categories' },
            { value: 'products', label: 'Chosen products' },
          ]}
          hint="The lists below are only used for the matching choice."
        />
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase">Categories</p>
            <div className="space-y-1">
              {CATEGORY_GROUPS.map((group) => (
                <Checkbox
                  key={group.id}
                  id={`category-${group.id}`}
                  name="categories"
                  value={group.id}
                  label={group.label}
                  defaultChecked={offer?.eligibility.categories.includes(group.id) ?? false}
                  disabled={disabled}
                />
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase">Products</p>
            <div className="max-h-56 space-y-1 overflow-y-auto border border-neutral-200 p-2">
              {products.length === 0 && <p className="text-xs text-neutral-600">The catalogue has no published products.</p>}
              {products.map((product) => (
                <Checkbox
                  key={product.slug}
                  id={`product-${product.slug}`}
                  name="productSlugs"
                  value={product.slug}
                  label={product.name}
                  defaultChecked={offer?.eligibility.productSlugs.includes(product.slug) ?? false}
                  disabled={disabled}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="mt-4">
          <Checkbox
            label="Skip items that already show a sale (compare-at) price"
            name="excludeSaleItems"
            defaultChecked={offer?.eligibility.excludeSaleItems ?? false}
            disabled={disabled}
          />
        </div>
      </fieldset>

      <TextField label="Starts" name="startsAt" type="datetime-local" defaultValue={toLocalInput(offer?.startsAt)} disabled={disabled} hint="Optional. Empty means as soon as it is activated." />
      <TextField label="Ends" name="endsAt" type="datetime-local" defaultValue={toLocalInput(offer?.endsAt)} disabled={disabled} hint="Optional. Empty means until paused or ended." />

      <TextField label="Total usage limit" name="usageLimit" inputMode="numeric" pattern="\d{0,7}" defaultValue={offer?.usageLimit ?? ''} disabled={disabled} hint="Optional. The most orders that may use it, across all customers." />
      <div className="space-y-2 self-end">
        <Checkbox label="One use per customer" name="oncePerCustomer" defaultChecked={offer?.oncePerCustomer ?? false} disabled={disabled} hint="Checked by email address at checkout. Always on for first-order offers." />
        <Checkbox label="Mention on the storefront once live" name="showOnStorefront" defaultChecked={offer?.showOnStorefront ?? false} disabled={disabled} />
      </div>

      <fieldset className="border border-neutral-200 p-4 md:col-span-2">
        <legend className="px-1 text-xs font-bold tracking-wide uppercase">Combining</legend>
        <p className="mb-3 text-xs leading-relaxed text-neutral-600">
          Checkout applies one discount per order: a valid code if the customer entered one, otherwise the automatic offer
          that saves the most. These preferences are recorded for when stacking is supported; they do not stack offers today.
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          <Checkbox label="With product discounts" name="combineProduct" defaultChecked={offer?.combinesWith.productDiscounts ?? false} disabled={disabled} />
          <Checkbox label="With order discounts" name="combineOrder" defaultChecked={offer?.combinesWith.orderDiscounts ?? false} disabled={disabled} />
          <Checkbox label="With shipping discounts" name="combineShipping" defaultChecked={offer?.combinesWith.shippingDiscounts ?? true} disabled={disabled} />
        </div>
      </fieldset>

      <TextArea label="Internal note" name="internalNote" maxLength={1000} rows={3} defaultValue={offer?.internalNote ?? ''} disabled={disabled} wrapClass="md:col-span-2" hint="Staff only: why this offer exists, the margin reasoning, who asked for it." />
    </div>
  );
}
