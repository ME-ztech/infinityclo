import type { Metadata } from 'next';
import Link from 'next/link';

import { Badge, Button, Card, Disconnected, Empty, Flash, LinkButton, PageHeader, TableWrap, TextField, inputClass, td, th } from '@/components/admin/ui';
import { INVENTORY_REASONS, REQUIRED_ADMIN_SCOPES, getGateway, type InventoryRow } from '@/server/admin/gateway';
import { param, requirePage, type SearchParams } from '@/server/admin/page';
import { can } from '@/server/admin/permissions';
import { getAdminSettings } from '@/server/admin/settings';

import { saveThresholdAction, setInventoryAction } from '../../actions/commerce';

export const metadata: Metadata = { title: 'Inventory' };

export default async function AdminInventoryPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requirePage('inventory.view');
  const params = await searchParams;
  const lowOnly = param(params, 'low') === '1';
  const search = param(params, 'q').toLowerCase();
  const gateway = await getGateway();
  const canEdit = can(session.role, 'inventory.edit');
  const { lowStockThreshold } = await getAdminSettings();

  let rows: InventoryRow[] = [];
  let error: string | null = null;
  if (gateway) {
    try {
      rows = await gateway.listInventory();
    } catch (caught) {
      error = (caught as Error).message;
    }
  }
  const isLow = (row: InventoryRow) => row.tracked && row.available <= lowStockThreshold;
  const lowCount = rows.filter(isLow).length;
  const visible = rows
    .filter((row) => !lowOnly || isLow(row))
    .filter((row) => !search || `${row.productTitle} ${row.variantTitle} ${row.sku ?? ''}`.toLowerCase().includes(search));
  const back = `/admin/inventory${lowOnly ? '?low=1' : ''}`;

  return (
    <>
      <PageHeader
        title="Inventory"
        description={
          gateway
            ? `Stock per variant and location. Source: ${gateway.sourceLabel}. A change is applied only if the count is still what this page shows, so two people — or a sale — cannot overwrite each other.`
            : undefined
        }
        actions={gateway ? <LinkButton href={lowOnly ? '/admin/inventory' : '/admin/inventory?low=1'} testId="inventory-low-toggle">{lowOnly ? 'Show all' : `Low stock only (${lowCount})`}</LinkButton> : undefined}
      />
      <Flash params={params} />
      {!gateway ? (
        <Disconnected module="Inventory" scopes={REQUIRED_ADMIN_SCOPES} />
      ) : (
        <>
          {gateway.mode === 'sandbox' && (
            <p className="mb-4 border border-amber-600 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              Sandbox stock numbers are synthetic placeholders (25 per variant that was in stock at import, 0 otherwise).
              They are not the store’s real counts.
            </p>
          )}
          {error && <p role="alert" className="mb-4 border border-red-700 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</p>}

          <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
            <form method="get" role="search" aria-label="Filter inventory" className="flex flex-wrap items-end gap-3">
              {lowOnly && <input type="hidden" name="low" value="1" />}
              <div>
                <label htmlFor="q" className="mb-1 block text-xs font-semibold uppercase">Search</label>
                <input id="q" name="q" defaultValue={param(params, 'q')} placeholder="Product, variant or SKU" className={`${inputClass} w-64`} />
              </div>
              <Button variant="secondary">Filter</Button>
            </form>
            {can(session.role, 'settings.edit') ? (
              <form action={saveThresholdAction} className="flex items-end gap-3">
                <input type="hidden" name="back" value={back} />
                <TextField label="Low-stock threshold" name="lowStockThreshold" defaultValue={lowStockThreshold} inputMode="numeric" pattern="\d{1,4}" required wrapClass="w-40" />
                <Button variant="secondary">Set</Button>
              </form>
            ) : (
              <p className="text-xs text-neutral-600">Low-stock threshold: {lowStockThreshold} (set by an Owner).</p>
            )}
          </div>

          {visible.length === 0 && !error ? (
            <Empty title={lowOnly ? 'Nothing is low on stock' : 'No inventory rows'}>
              {lowOnly ? `No tracked variant is at or below ${lowStockThreshold}.` : 'No variants match.'}
            </Empty>
          ) : (
            <TableWrap label="Inventory levels">
              <thead>
                <tr>
                  <th className={th}>Product / variant</th>
                  <th className={th}>SKU</th>
                  <th className={th}>Location</th>
                  <th className={th}>Available</th>
                  <th className={th}>Committed</th>
                  <th className={th}>Unavailable</th>
                  <th className={th}>On hand</th>
                  <th className={th}>Set available</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const key = `${row.inventoryItemId}-${row.locationId}`.replace(/[^\w-]/g, '');
                  return (
                    <tr key={key} data-testid="inventory-row">
                      <td className={td}>
                        <Link href={`/admin/products/${row.productId}`} className="font-semibold underline-offset-4 hover:underline">{row.productTitle}</Link>
                        <span className="block text-xs text-neutral-600">{row.variantTitle}</span>
                      </td>
                      <td className={`${td} font-mono text-xs`}>{row.sku ?? '—'}</td>
                      <td className={td}>{row.locationName}</td>
                      <td className={`${td} tabular-nums`}>
                        <span data-testid="inventory-available">{row.available}</span>{' '}
                        {isLow(row) && <Badge tone={row.available <= 0 ? 'bad' : 'warn'}>{row.available <= 0 ? 'Out' : 'Low'}</Badge>}
                      </td>
                      <td className={`${td} tabular-nums`}>{row.committed ?? '—'}</td>
                      <td className={`${td} tabular-nums`}>{row.unavailable ?? '—'}</td>
                      <td className={`${td} tabular-nums`}>{row.onHand ?? '—'}</td>
                      <td className={td}>
                        {!row.tracked ? (
                          <span className="text-xs text-neutral-600">Not tracked — turn on tracking for this variant in Shopify to manage stock.</span>
                        ) : !canEdit ? (
                          <span className="text-xs text-neutral-600">View only for your role.</span>
                        ) : (
                          <form action={setInventoryAction} className="flex flex-wrap items-center gap-2">
                            <input type="hidden" name="back" value={back} />
                            <input type="hidden" name="inventoryItemId" value={row.inventoryItemId} />
                            <input type="hidden" name="locationId" value={row.locationId} />
                            <input type="hidden" name="expected" value={row.available} />
                            <input aria-label={`New available quantity for ${row.productTitle} ${row.variantTitle}`} name="quantity" defaultValue={row.available} required inputMode="numeric" pattern="\d{1,7}" data-testid="inventory-quantity" className={`${inputClass} w-20`} />
                            <select aria-label="Reason for the change" name="reason" defaultValue="correction" className={`${inputClass} w-44`}>
                              {Object.entries(INVENTORY_REASONS).map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                              ))}
                            </select>
                            <Button variant="secondary" testId="inventory-save">Save</Button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>
          )}
          <Card title="How stock changes are applied">
            <p className="text-sm leading-relaxed text-neutral-700">
              “Available” is what customers can buy. “Committed” is reserved by paid, unfulfilled orders. Saving sends
              the new number together with the number you were looking at; if stock moved in between (a sale, a
              return, another staff member) the change is refused and you are asked to reload, instead of silently
              overwriting the newer count.
            </p>
          </Card>
        </>
      )}
    </>
  );
}
