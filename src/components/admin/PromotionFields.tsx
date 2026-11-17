'use client';

import { useState } from 'react';

import type { PromotionConfig } from '@/domain/promotions';

import { Field, inputClass } from './ui';

const toLocal = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16) : '');

/** Promotion editor fields; the visible set follows the chosen kind. */
export function PromotionFields({
  name,
  config,
  readOnly = false,
}: {
  name: string;
  config: PromotionConfig | null;
  readOnly?: boolean;
}) {
  const [kind, setKind] = useState<PromotionConfig['kind']>(config?.kind ?? 'percentage');
  const [method, setMethod] = useState(config?.method ?? 'automatic');
  const [scope, setScope] = useState(config?.scope.type ?? 'all');
  const [valueType, setValueType] = useState(
    config?.kind === 'bundle' ? config.value.type : 'percentage',
  );
  const percent =
    config?.kind === 'percentage'
      ? config.percent
      : config?.kind === 'bundle' && config.value.type === 'percentage'
        ? config.value.percent
        : null;
  return (
    <fieldset disabled={readOnly} className="grid gap-4 md:grid-cols-2">
      <Field label="Internal name">
        <input name="name" defaultValue={name} className={inputClass} required />
      </Field>
      <Field label="Type">
        <select
          name="kind"
          value={kind}
          onChange={(event) => setKind(event.target.value as PromotionConfig['kind'])}
          className={inputClass}
        >
          <option value="percentage">Percentage off</option>
          <option value="bundle">Bundle (buy N, save)</option>
          <option value="gift_with_purchase">Free gift over a spend</option>
        </select>
      </Field>
      <Field label="Customer-facing title" hint="Shown in the cart and at Shopify checkout.">
        <input name="title" defaultValue={config?.title} className={inputClass} required />
      </Field>
      <Field label="How it applies">
        <select
          name="method"
          value={method}
          onChange={(event) => setMethod(event.target.value as 'automatic' | 'code')}
          className={inputClass}
        >
          <option value="automatic">Automatically at checkout</option>
          <option value="code">With a discount code</option>
        </select>
      </Field>
      {method === 'code' && (
        <Field label="Discount code">
          <input
            name="code"
            defaultValue={config?.code}
            className={inputClass}
            placeholder="WELCOME10"
          />
        </Field>
      )}

      {kind === 'percentage' && (
        <>
          <Field label="Percent off">
            <input
              name="percent"
              type="number"
              min={1}
              max={90}
              defaultValue={percent ?? ''}
              className={inputClass}
            />
          </Field>
          <Field label="Who can use it">
            <select
              name="eligibility"
              defaultValue={config?.kind === 'percentage' ? config.eligibility : 'all'}
              className={inputClass}
            >
              <option value="all">Everyone</option>
              <option value="first_order">
                First order only (Shopify segment: customers with no orders)
              </option>
            </select>
          </Field>
          <Field label="Minimum eligible spend (CAD, optional)">
            <input
              name="minimumSubtotal"
              inputMode="decimal"
              defaultValue={
                config?.kind === 'percentage' && config.minimumSubtotalCents
                  ? (config.minimumSubtotalCents / 100).toFixed(2)
                  : ''
              }
              className={inputClass}
            />
          </Field>
        </>
      )}
      {kind === 'bundle' && (
        <>
          <Field label="Minimum eligible pieces">
            <input
              name="minimumQuantity"
              type="number"
              min={2}
              max={10}
              defaultValue={config?.kind === 'bundle' ? config.minimumQuantity : 2}
              className={inputClass}
            />
          </Field>
          <Field label="Saving">
            <select
              name="valueType"
              value={valueType}
              onChange={(event) =>
                setValueType(event.target.value as 'percentage' | 'amount_off_order')
              }
              className={inputClass}
            >
              <option value="percentage">Percent off each eligible piece</option>
              <option value="amount_off_order">Fixed amount off the order</option>
            </select>
          </Field>
          {valueType === 'percentage' ? (
            <Field label="Percent off each">
              <input
                name="percent"
                type="number"
                min={1}
                max={90}
                defaultValue={percent ?? ''}
                className={inputClass}
              />
            </Field>
          ) : (
            <Field label="Amount off (CAD)">
              <input
                name="amountOff"
                inputMode="decimal"
                defaultValue={
                  config?.kind === 'bundle' &&
                  config.value.type === 'amount_off_order' &&
                  config.value.amountCents
                    ? (config.value.amountCents / 100).toFixed(2)
                    : ''
                }
                className={inputClass}
              />
            </Field>
          )}
        </>
      )}
      {kind === 'gift_with_purchase' && (
        <>
          <Field label="Minimum cart spend (CAD)">
            <input
              name="minimumSubtotal"
              inputMode="decimal"
              defaultValue={
                config?.kind === 'gift_with_purchase'
                  ? (config.minimumSubtotalCents / 100).toFixed(2)
                  : ''
              }
              className={inputClass}
            />
          </Field>
          <Field label="Gift product handle">
            <input
              name="giftProductHandle"
              defaultValue={config?.kind === 'gift_with_purchase' ? config.giftProductHandle : ''}
              className={inputClass}
              placeholder="infnity-crew-socks"
            />
          </Field>
        </>
      )}

      <Field label="Applies to">
        <select
          name="scopeType"
          value={scope}
          onChange={(event) => setScope(event.target.value as 'all' | 'products')}
          className={inputClass}
        >
          <option value="all">All products</option>
          <option value="products">Specific products</option>
        </select>
      </Field>
      {scope === 'products' && (
        <Field label="Product handles (comma or space separated)">
          <input
            name="productHandles"
            defaultValue={config?.scope.productHandles.join(', ')}
            className={inputClass}
          />
        </Field>
      )}
      <Field label="Starts (Central time, blank = when published)">
        <input
          name="startsAt"
          type="datetime-local"
          defaultValue={toLocal(config?.startsAt ?? null)}
          className={inputClass}
        />
      </Field>
      <Field label="Ends (blank = no end date)">
        <input
          name="endsAt"
          type="datetime-local"
          defaultValue={toLocal(config?.endsAt ?? null)}
          className={inputClass}
        />
      </Field>
      <Field label="Total uses (blank = unlimited)">
        <input
          name="usageLimit"
          type="number"
          min={1}
          defaultValue={config?.usageLimit ?? ''}
          className={inputClass}
        />
      </Field>
      <div className="flex flex-col gap-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="oncePerCustomer" defaultChecked={config?.oncePerCustomer} />{' '}
          Once per customer (codes)
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="excludeSaleItems"
            defaultChecked={config?.scope.excludeSaleItems ?? true}
          />{' '}
          Exclude items already on sale
        </label>
        <span className="mt-1 text-xs font-semibold">Can combine with:</span>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="combineProduct"
            defaultChecked={config?.combinesWith.productDiscounts}
          />{' '}
          other product discounts
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="combineOrder"
            defaultChecked={config?.combinesWith.orderDiscounts}
          />{' '}
          order discounts
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="combineShipping"
            defaultChecked={config?.combinesWith.shippingDiscounts ?? true}
          />{' '}
          shipping discounts
        </label>
      </div>
    </fieldset>
  );
}
