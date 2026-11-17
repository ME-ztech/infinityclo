import type { Metadata } from 'next';

import { saveThresholdAction } from '@/app/admin/actions/commerce';
import { createStaffAction, deleteStaffAction, updateStaffAction } from '@/app/admin/actions/local';
import {
  createShippingRateAction,
  createTaxRateAction,
  deleteShippingRateAction,
  deleteTaxRateAction,
  updateShippingRateAction,
  updateTaxRateAction,
} from '@/app/admin/actions/rates';
import { Badge, Button, Card, Checkbox, Empty, Flash, PageHeader, SelectField, TableWrap, TextField, formatDate, inputClass, td, th } from '@/components/admin/ui';
import { OWNER_ID, listStaff } from '@/server/admin/auth';
import { requirePage, type SearchParams } from '@/server/admin/page';
import { ROLES, ROLE_LABELS, can } from '@/server/admin/permissions';
import { listShippingRates, listTaxRates, type ShippingRateRow, type TaxRateRow } from '@/server/admin/rates';
import { getAdminSettings } from '@/server/admin/settings';
import { listAudit } from '@/server/audit';
import { checkoutReadiness } from '@/server/commerce/service';
import { config, integrationStatus } from '@/server/config';
import { isDatabaseConfigured } from '@/server/db/client';
import { getStore } from '@/server/store';

export const metadata: Metadata = { title: 'Settings' };

const STATUS_TONE = { connected: 'good', partial: 'warn', not_connected: 'bad' } as const;
const STATUS_LABEL = { connected: 'Connected', partial: 'Partly set up', not_connected: 'Not connected' } as const;
const OUTCOME_TONE = { ok: 'neutral', denied: 'bad', failed: 'warn' } as const;

const dollars = (cents: number | null): string => (cents === null ? '' : (cents / 100).toFixed(2));
const percent = (bps: number): string => String(bps / 100);
const cell = `${inputClass} min-w-20`;

function ShippingRow({ rate }: { rate: ShippingRateRow }) {
  const form = `ship-${rate.id}`;
  return (
    <tr data-testid="shipping-rate-row">
      <td className={td}>
        <input form={form} name="name" aria-label="Name" defaultValue={rate.name} required maxLength={80} className={cell} />
      </td>
      <td className={td}>
        <input form={form} name="countries" aria-label="Countries" defaultValue={rate.countries.join(', ')} required className={cell} />
      </td>
      <td className={td}>
        <input form={form} name="provinces" aria-label="Provinces" defaultValue={rate.provinces.join(', ')} className={cell} />
      </td>
      <td className={td}>
        <input form={form} name="price" aria-label="Price in dollars" defaultValue={dollars(rate.priceCents)} required inputMode="decimal" className={`${cell} tabular-nums`} />
      </td>
      <td className={td}>
        <input form={form} name="freeOver" aria-label="Free over, in dollars" defaultValue={dollars(rate.freeOverCents)} inputMode="decimal" className={`${cell} tabular-nums`} />
      </td>
      <td className={td}>
        <input form={form} name="deliveryEstimate" aria-label="Delivery estimate shown to customers" defaultValue={rate.deliveryEstimate ?? ''} maxLength={120} className={cell} />
      </td>
      <td className={td}>
        <input form={form} name="position" aria-label="Display order" defaultValue={rate.position} inputMode="numeric" className={`${inputClass} w-16 tabular-nums`} />
      </td>
      <td className={td}>
        <label className="flex items-center gap-2 text-xs">
          <input form={form} type="checkbox" name="active" defaultChecked={rate.active} className="size-4 accent-neutral-950" />
          Offered
        </label>
      </td>
      <td className={td}>
        <form id={form} action={updateShippingRateAction} className="mb-2">
          <input type="hidden" name="id" value={rate.id} />
          <Button variant="secondary" aria-label={`Save shipping rate ${rate.name}`}>Save</Button>
        </form>
        <form action={deleteShippingRateAction} className="flex items-center gap-2">
          <input type="hidden" name="id" value={rate.id} />
          <input name="confirm" aria-label={`Type DELETE to delete shipping rate ${rate.name}`} placeholder="DELETE" required pattern="DELETE" autoComplete="off" className={`${inputClass} w-24 font-mono`} />
          <Button variant="danger" aria-label={`Delete shipping rate ${rate.name}`}>Delete</Button>
        </form>
      </td>
    </tr>
  );
}

function TaxRow({ rate }: { rate: TaxRateRow }) {
  const form = `tax-${rate.id}`;
  return (
    <tr data-testid="tax-rate-row">
      <td className={td}>
        <input form={form} name="name" aria-label="Tax name" defaultValue={rate.name} required maxLength={40} className={cell} />
      </td>
      <td className={td}>
        <input form={form} name="country" aria-label="Country code" defaultValue={rate.country} required maxLength={2} className={`${inputClass} w-16`} />
      </td>
      <td className={td}>
        <input form={form} name="province" aria-label="Province code" defaultValue={rate.province} maxLength={3} className={`${inputClass} w-16`} />
      </td>
      <td className={td}>
        <input form={form} name="rate" aria-label="Rate, percent" defaultValue={percent(rate.rateBps)} required inputMode="decimal" className={`${inputClass} w-24 tabular-nums`} />
      </td>
      <td className={td}>
        <label className="flex items-center gap-2 text-xs">
          <input form={form} type="checkbox" name="appliesToShipping" defaultChecked={rate.appliesToShipping} className="size-4 accent-neutral-950" />
          On shipping too
        </label>
      </td>
      <td className={td}>
        <label className="flex items-center gap-2 text-xs">
          <input form={form} type="checkbox" name="active" defaultChecked={rate.active} className="size-4 accent-neutral-950" />
          Charged
        </label>
      </td>
      <td className={td}>
        <form id={form} action={updateTaxRateAction} className="mb-2">
          <input type="hidden" name="id" value={rate.id} />
          <Button variant="secondary" aria-label={`Save tax rate ${rate.name}`}>Save</Button>
        </form>
        <form action={deleteTaxRateAction} className="flex items-center gap-2">
          <input type="hidden" name="id" value={rate.id} />
          <input name="confirm" aria-label={`Type DELETE to delete tax rate ${rate.name}`} placeholder="DELETE" required pattern="DELETE" autoComplete="off" className={`${inputClass} w-24 font-mono`} />
          <Button variant="danger" aria-label={`Delete tax rate ${rate.name}`}>Delete</Button>
        </form>
      </td>
    </tr>
  );
}

export default async function AdminSettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requirePage('settings.view');
  const params = await searchParams;
  const canEdit = can(session.role, 'settings.edit');
  const canStaff = can(session.role, 'staff.manage');
  const canAudit = can(session.role, 'audit.view');
  const database = isDatabaseConfigured();

  const [readiness, settings, staff, auditEntries] = await Promise.all([
    checkoutReadiness(),
    getAdminSettings(),
    canStaff ? listStaff() : Promise.resolve([]),
    canAudit ? listAudit(150) : Promise.resolve([]),
  ]);

  let shipping: ShippingRateRow[] = [];
  let tax: TaxRateRow[] = [];
  let ratesError: string | null = null;
  if (database) {
    try {
      [shipping, tax] = await Promise.all([listShippingRates(), listTaxRates()]);
    } catch (error) {
      ratesError = (error as Error).message;
    }
  }
  const integrations = integrationStatus();
  const store = getStore();

  return (
    <>
      <PageHeader
        title="Settings"
        description="What this deployment is connected to, the rates every order is charged with, and who can sign in. Secrets are never shown here — only whether each one is set."
      />
      <Flash params={params} />

      <Card title="Environment and checkout" testId="settings-readiness">
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold text-neutral-600 uppercase">Environment</dt>
            <dd className="mt-1">
              <Badge tone={config.environment === 'production' ? 'bad' : 'neutral'} testId="settings-environment">{config.environment}</Badge>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-neutral-600 uppercase">Checkout</dt>
            <dd className="mt-1">
              <Badge tone={readiness.open ? 'good' : 'bad'} testId="settings-checkout-state">{readiness.open ? 'Open — orders can be taken' : 'Closed'}</Badge>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-neutral-600 uppercase">Store currency</dt>
            <dd className="mt-1">CAD — prices, shipping and tax are all in Canadian dollars.</dd>
          </div>
        </dl>
        {!readiness.open && (
          <div className="mt-4 border border-amber-600 bg-amber-50 p-4 text-sm text-amber-950" role="status">
            <p className="font-bold">Checkout is closed until each of these is in place:</p>
            <ul className="mt-2 list-disc pl-5" data-testid="settings-missing">
              {readiness.missing.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="mt-2">Customers can still browse and build a cart; the checkout button tells them it is not open yet.</p>
          </div>
        )}
      </Card>

      <Card title="Connections" description="Variable names only. A value is never displayed, logged or sent to the browser.">
        <TableWrap label="Integration status">
          <thead>
            <tr>
              <th className={th}>Service</th>
              <th className={th}>State</th>
              <th className={th}>What that means</th>
              <th className={th}>Configuration</th>
            </tr>
          </thead>
          <tbody>
            {integrations.map((integration) => (
              <tr key={integration.id} data-testid="integration-row">
                <td className={`${td} font-semibold`}>{integration.label}</td>
                <td className={td}><Badge tone={STATUS_TONE[integration.status]}>{STATUS_LABEL[integration.status]}</Badge></td>
                <td className={`${td} max-w-md`}>{integration.detail}</td>
                <td className={td}>
                  <ul className="space-y-0.5 font-mono text-xs">
                    {integration.variables.map((variable) => (
                      <li key={variable.name}>
                        {variable.name}: <span className={variable.set ? 'text-emerald-800' : variable.required ? 'text-red-800' : 'text-neutral-600'}>{variable.set ? 'set' : variable.required ? 'not set' : 'not set (optional)'}</span>
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
            <tr>
              <td className={`${td} font-semibold`}>Content and records storage</td>
              <td className={td}><Badge tone={store.durable ? 'good' : 'bad'}>{store.durable ? 'Durable' : 'Not durable'}</Badge></td>
              <td className={`${td} max-w-md`}>
                {store.kind === 'postgres'
                  ? 'Site content, offer drafts, subscribers, tickets, staff and the audit log are stored in the commerce database.'
                  : `Stored in the “${store.kind}” store.${store.durable ? '' : ' Changes on this host can be lost — configure the database.'}`}
              </td>
              <td className={`${td} font-mono text-xs`}>{store.kind}</td>
            </tr>
          </tbody>
        </TableWrap>
      </Card>

      <Card
        id="shipping"
        title="Shipping rates"
        description={
          <>
            Flat rates by destination. <strong>With no active rate, checkout is closed</strong> — an order cannot be priced
            without one. Nothing is pre-filled: enter the prices you actually charge. An address that matches no rate is
            told “we do not currently ship to that address”.
          </>
        }
      >
        {!database ? (
          <p className="text-sm text-neutral-700">The commerce database is not configured, so rates cannot be stored.</p>
        ) : ratesError ? (
          <p role="alert" className="text-sm text-red-900">Rates could not be read: {ratesError}</p>
        ) : (
          <>
            {shipping.length === 0 ? (
              <Empty title="No shipping rates">Checkout is closed until you add one below.</Empty>
            ) : (
              <TableWrap label="Shipping rates">
                <thead>
                  <tr>
                    <th className={th}>Name</th>
                    <th className={th}>Countries</th>
                    <th className={th}>Provinces</th>
                    <th className={th}>Price ($)</th>
                    <th className={th}>Free over ($)</th>
                    <th className={th}>Delivery estimate</th>
                    <th className={th}>Order</th>
                    <th className={th}>Status</th>
                    <th className={th}>Actions</th>
                  </tr>
                </thead>
                <tbody>{shipping.map((rate) => (canEdit ? <ShippingRow key={rate.id} rate={rate} /> : (
                  <tr key={rate.id} data-testid="shipping-rate-row">
                    <td className={td}>{rate.name}</td>
                    <td className={td}>{rate.countries.join(', ')}</td>
                    <td className={td}>{rate.provinces.join(', ') || '—'}</td>
                    <td className={`${td} tabular-nums`}>{dollars(rate.priceCents)}</td>
                    <td className={`${td} tabular-nums`}>{dollars(rate.freeOverCents) || '—'}</td>
                    <td className={td}>{rate.deliveryEstimate ?? '—'}</td>
                    <td className={td}>{rate.position}</td>
                    <td className={td}>{rate.active ? 'Offered' : 'Off'}</td>
                    <td className={td}>—</td>
                  </tr>
                )))}</tbody>
              </TableWrap>
            )}

            {canEdit && (
              <form action={createShippingRateAction} className="mt-5 grid gap-4 border-t border-neutral-200 pt-5 md:grid-cols-3" data-testid="shipping-rate-form">
                <h3 className="text-xs font-bold tracking-[0.1em] uppercase md:col-span-3">Add a shipping rate</h3>
                <TextField label="Name" name="name" required maxLength={80} placeholder="Standard" hint="Shown to customers at checkout." data-testid="shipping-name" />
                <TextField label="Countries" name="countries" required placeholder="CA" hint="Two-letter codes separated by commas (CA, US), or * for anywhere." data-testid="shipping-countries" />
                <TextField label="Provinces (optional)" name="provinces" placeholder="MB, SK" hint="Only when the rate is for one country. Empty means the whole country." />
                <TextField label="Price ($)" name="price" required inputMode="decimal" placeholder="15.00" hint="0 for free shipping." data-testid="shipping-price" />
                <TextField label="Free over ($, optional)" name="freeOver" inputMode="decimal" hint="Order value, after discounts, at which this rate becomes free." />
                <TextField label="Delivery estimate (optional)" name="deliveryEstimate" maxLength={120} hint="Shown to customers exactly as typed. Leave empty unless you can stand behind it." />
                <TextField label="Display order" name="position" inputMode="numeric" defaultValue={0} wrapClass="max-w-32" hint="Lower shows first." />
                <div className="self-end">
                  <Checkbox id="new-shipping-active" label="Offer this rate at checkout" name="active" defaultChecked />
                </div>
                <div className="self-end">
                  <Button testId="shipping-rate-add">Add shipping rate</Button>
                </div>
              </form>
            )}
          </>
        )}
      </Card>

      <Card
        id="tax"
        title="Tax rates"
        description={
          <>
            Sales tax by destination. <strong>Enter tax rates only once the business’s tax registration is confirmed</strong>{' '}
            with your accountant: a business that is not registered to collect a tax must not charge it, and one that is
            registered must. Nothing is pre-filled. With no rate for a destination, no tax is added to that order. Several
            rates can apply to one address (for example a federal and a provincial tax); each appears as its own line.
          </>
        }
      >
        {!database ? (
          <p className="text-sm text-neutral-700">The commerce database is not configured, so rates cannot be stored.</p>
        ) : ratesError ? null : (
          <>
            {tax.length === 0 ? (
              <Empty title="No tax rates">No tax is being charged on any order.</Empty>
            ) : (
              <TableWrap label="Tax rates">
                <thead>
                  <tr>
                    <th className={th}>Name</th>
                    <th className={th}>Country</th>
                    <th className={th}>Province</th>
                    <th className={th}>Rate (%)</th>
                    <th className={th}>Shipping</th>
                    <th className={th}>Status</th>
                    <th className={th}>Actions</th>
                  </tr>
                </thead>
                <tbody>{tax.map((rate) => (canEdit ? <TaxRow key={rate.id} rate={rate} /> : (
                  <tr key={rate.id} data-testid="tax-rate-row">
                    <td className={td}>{rate.name}</td>
                    <td className={td}>{rate.country}</td>
                    <td className={td}>{rate.province || 'All'}</td>
                    <td className={`${td} tabular-nums`}>{percent(rate.rateBps)}</td>
                    <td className={td}>{rate.appliesToShipping ? 'Yes' : 'No'}</td>
                    <td className={td}>{rate.active ? 'Charged' : 'Off'}</td>
                    <td className={td}>—</td>
                  </tr>
                )))}</tbody>
              </TableWrap>
            )}

            {canEdit && (
              <form action={createTaxRateAction} className="mt-5 grid gap-4 border-t border-neutral-200 pt-5 md:grid-cols-4" data-testid="tax-rate-form">
                <h3 className="text-xs font-bold tracking-[0.1em] uppercase md:col-span-4">Add a tax rate</h3>
                <TextField label="Name" name="name" required maxLength={40} hint="As it should read on the order." data-testid="tax-name" />
                <TextField label="Country" name="country" required maxLength={2} placeholder="CA" data-testid="tax-country" />
                <TextField label="Province (optional)" name="province" maxLength={3} hint="Empty applies to the whole country." />
                <TextField label="Rate (%)" name="rate" required inputMode="decimal" hint="For example 5 or 9.975." data-testid="tax-rate" />
                <Checkbox id="new-tax-shipping" label="Also charged on shipping" name="appliesToShipping" defaultChecked />
                <Checkbox id="new-tax-active" label="Charge this tax" name="active" defaultChecked />
                <div>
                  <Button testId="tax-rate-add">Add tax rate</Button>
                </div>
              </form>
            )}
          </>
        )}
      </Card>

      <Card title="Low-stock alert" description="Variants at or below this many available units are flagged on the Overview and Inventory screens.">
        {canEdit ? (
          <form action={saveThresholdAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="back" value="/admin/settings" />
            <TextField label="Threshold" name="lowStockThreshold" defaultValue={settings.lowStockThreshold} inputMode="numeric" pattern="\d{1,4}" required wrapClass="w-40" />
            <Button variant="secondary" testId="threshold-save">Save</Button>
          </form>
        ) : (
          <p className="text-sm">{settings.lowStockThreshold} units.</p>
        )}
      </Card>

      {canStaff && (
        <Card
          id="staff"
          title="Staff"
          description="Each person signs in with their own account and holds only what their role needs. The first Owner is set in this deployment’s configuration and is managed there, not here."
        >
          <TableWrap label="Staff accounts">
            <thead>
              <tr>
                <th className={th}>Person</th>
                <th className={th}>Role</th>
                <th className={th}>State</th>
                <th className={th}>Change</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={td}>
                  Owner
                  <span className="block text-xs text-neutral-600">{config.admin.ownerEmail ?? 'not configured'}</span>
                </td>
                <td className={td}>{ROLE_LABELS.owner}</td>
                <td className={td}><Badge tone="good">Active</Badge></td>
                <td className={`${td} text-xs text-neutral-600`}>
                  Set by ADMIN_OWNER_EMAIL and ADMIN_OWNER_PASSWORD_HASH. Change the password with{' '}
                  <code className="font-mono">npm run admin:setup</code>.
                </td>
              </tr>
              {staff.map((member) => (
                <tr key={member.id} data-testid="staff-row">
                  <td className={td}>
                    {member.name}
                    <span className="block text-xs text-neutral-600">{member.email}</span>
                  </td>
                  <td className={td}>{ROLE_LABELS[member.role]}</td>
                  <td className={td}><Badge tone={member.disabled ? 'bad' : 'good'}>{member.disabled ? 'Disabled' : 'Active'}</Badge></td>
                  <td className={td}>
                    {member.id === session.id || member.id === OWNER_ID ? (
                      <span className="text-xs text-neutral-600">This is you. Another Owner must change your access.</span>
                    ) : (
                      <div className="space-y-2">
                        <form action={updateStaffAction} className="flex flex-wrap items-center gap-2">
                          <input type="hidden" name="id" value={member.id} />
                          <input type="hidden" name="operation" value="role" />
                          <select name="role" aria-label={`Role for ${member.email}`} defaultValue={member.role} className={`${inputClass} w-48`}>
                            {ROLES.map((role) => (
                              <option key={role} value={role}>
                                {ROLE_LABELS[role]}
                              </option>
                            ))}
                          </select>
                          <Button variant="secondary">Change role</Button>
                        </form>
                        <form action={updateStaffAction} className="flex flex-wrap items-center gap-2">
                          <input type="hidden" name="id" value={member.id} />
                          <input type="hidden" name="operation" value="password" />
                          <input name="password" type="password" autoComplete="new-password" minLength={12} required aria-label={`New password for ${member.email}`} placeholder="New password (12+)" className={`${inputClass} w-48`} />
                          <Button variant="secondary">Set password</Button>
                        </form>
                        <div className="flex flex-wrap items-center gap-2">
                          <form action={updateStaffAction}>
                            <input type="hidden" name="id" value={member.id} />
                            <input type="hidden" name="operation" value={member.disabled ? 'enable' : 'disable'} />
                            <Button variant="secondary">{member.disabled ? 'Enable' : 'Disable'}</Button>
                          </form>
                          <form action={deleteStaffAction} className="flex items-center gap-2">
                            <input type="hidden" name="id" value={member.id} />
                            <input name="confirm" aria-label={`Type DELETE to delete ${member.email}`} placeholder="DELETE" required pattern="DELETE" autoComplete="off" className={`${inputClass} w-24 font-mono`} />
                            <Button variant="danger">Delete</Button>
                          </form>
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>

          <form action={createStaffAction} className="mt-5 grid gap-4 border-t border-neutral-200 pt-5 md:grid-cols-4" data-testid="staff-form">
            <h3 className="text-xs font-bold tracking-[0.1em] uppercase md:col-span-4">Add a staff account</h3>
            <TextField label="Name" name="name" required maxLength={80} />
            <TextField label="Email" name="email" type="email" required maxLength={254} autoComplete="off" />
            <SelectField label="Role" name="role" defaultValue="support" options={ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] }))} />
            <TextField label="Password" name="password" type="password" required minLength={12} autoComplete="new-password" hint="At least 12 characters. Give it to them privately; they cannot change it themselves yet." />
            <div className="md:col-span-4">
              <Button testId="staff-add">Add staff account</Button>
            </div>
          </form>
        </Card>
      )}

      <Card title="Shipping carriers, payment methods and payouts" description="Managed where they live, not here.">
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-neutral-800">
          <li>Payment methods (cards, wallets), payouts and disputes are managed in the Stripe dashboard for the connected account.</li>
          <li>Shipping labels are bought from your carrier; record the tracking number on the order when it ships.</li>
          <li>Returns and exchanges are reviewed in the Inbox and completed as a refund on the order.</li>
        </ul>
      </Card>

      {canAudit && (
        <Card id="audit" title="Audit log" description="The most recent 150 staff actions, including refused ones. Entries cannot be edited or deleted from the application.">
          {auditEntries.length === 0 ? (
            <Empty title="No activity recorded yet" />
          ) : (
            <TableWrap label="Audit log">
              <thead>
                <tr>
                  <th className={th}>When</th>
                  <th className={th}>Who</th>
                  <th className={th}>Action</th>
                  <th className={th}>On</th>
                  <th className={th}>Result</th>
                  <th className={th}>Detail</th>
                </tr>
              </thead>
              <tbody>
                {auditEntries.map((entry) => (
                  <tr key={entry.id} data-testid="audit-row">
                    <td className={`${td} whitespace-nowrap`}>{formatDate(entry.at)}</td>
                    <td className={td}>
                      {entry.actor}
                      <span className="block text-xs text-neutral-600">{entry.role}</span>
                    </td>
                    <td className={`${td} font-mono text-xs`}>{entry.action}</td>
                    <td className={`${td} font-mono text-xs break-all`}>{entry.target || '—'}</td>
                    <td className={td}><Badge tone={OUTCOME_TONE[entry.outcome]}>{entry.outcome}</Badge></td>
                    <td className={`${td} max-w-md text-xs`}>{entry.detail}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
      )}
    </>
  );
}
