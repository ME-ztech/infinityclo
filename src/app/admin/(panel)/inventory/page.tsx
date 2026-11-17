import Link from 'next/link';

import { ActionForm } from '@/components/admin/ActionForm';
import { AdminPage, Badge, NotConnected, Table, Td } from '@/components/admin/ui';
import { catalogRepository } from '@/data';
import { can } from '@/domain/rbac';
import { requireStaffPage } from '@/server/auth/staff';
import { getSettings } from '@/server/content/cms';
import { isAdminConfigured } from '@/server/shopify/config';
import { listInventory } from '@/server/shopify/admin';

import { setStockAction } from './actions';

export const metadata = { title: 'Inventory' };

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; low?: string; after?: string }>;
}) {
  const session = await requireStaffPage('inventory:read', '/admin/inventory');
  const { q, low, after } = await searchParams;
  const settings = await getSettings();

  if (!isAdminConfigured()) {
    const { products } = await catalogRepository.listProducts();
    return (
      <AdminPage
        title="Inventory"
        description="Without the Admin API only the storefront's in-stock / sold-out flags are known — never counts."
      >
        <NotConnected
          what="Stock counts and restocking"
          envVar="SHOPIFY_ADMIN_ACCESS_TOKEN"
          scopes="read_inventory, write_inventory, read_locations"
        />
        <Table head={['Product', 'Variant', 'Storefront availability']}>
          {products.flatMap((product) =>
            product.variants.map((variant) => (
              <tr key={variant.id}>
                <Td>{product.name}</Td>
                <Td>{variant.title}</Td>
                <Td>
                  {variant.availability === 'in_stock' ? (
                    <Badge tone="good">In stock</Badge>
                  ) : (
                    <Badge tone="bad">Sold out</Badge>
                  )}
                </Td>
              </tr>
            )),
          )}
        </Table>
      </AdminPage>
    );
  }

  const { rows, pageInfo } = await listInventory(q ?? null, after ?? null);
  const canWrite = can(session.user.role, 'inventory:write');
  const visible =
    low === '1'
      ? rows.filter((row) =>
          row.levels.some((level) => level.available <= settings.lowStockThreshold),
        )
      : rows;
  return (
    <AdminPage
      title="Inventory"
      description={`Available stock per variant and location, live from Shopify. Changes are compare-and-set: if a sale lands while you edit, Shopify rejects the stale value instead of overwriting it. Low stock = ${settings.lowStockThreshold} or fewer.`}
    >
      <form className="flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search product or SKU"
          className="border-line h-10 w-full max-w-xs border bg-white px-3 text-sm"
          aria-label="Search inventory"
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="low" value="1" defaultChecked={low === '1'} /> Low stock only
        </label>
        <button className="border-ink h-10 border px-4 text-xs font-semibold uppercase">
          Filter
        </button>
      </form>
      <Table
        head={[
          'Product',
          'Variant',
          'SKU',
          'Location',
          'Available',
          'Committed',
          'On hand',
          canWrite ? 'Set available' : '',
        ]}
      >
        {visible.flatMap((row) =>
          row.levels.map((level) => (
            <tr key={`${row.variantId}-${level.locationId}`}>
              <Td>
                <Link
                  href={`/admin/products/${row.productId.split('/').pop()}`}
                  className="underline-offset-4 hover:underline"
                >
                  {row.productTitle}
                </Link>
              </Td>
              <Td>{row.variantTitle}</Td>
              <Td>{row.sku ?? '—'}</Td>
              <Td>{level.locationName}</Td>
              <Td
                className={
                  level.available <= settings.lowStockThreshold ? 'text-signal font-semibold' : ''
                }
              >
                {level.available}
              </Td>
              <Td>{level.committed}</Td>
              <Td>{level.onHand}</Td>
              <Td>
                {canWrite && row.tracked ? (
                  <ActionForm action={setStockAction} submitLabel="Set" variant="secondary" inline>
                    <input type="hidden" name="inventoryItemId" value={row.inventoryItemId} />
                    <input type="hidden" name="locationId" value={level.locationId} />
                    <input type="hidden" name="expectedCurrent" value={level.available} />
                    <input
                      type="hidden"
                      name="label"
                      value={`${row.productTitle} — ${row.variantTitle} @ ${level.locationName}`}
                    />
                    <input
                      name="quantity"
                      type="number"
                      min={0}
                      defaultValue={level.available}
                      className="border-line h-9 w-20 border px-2"
                      aria-label="New available quantity"
                    />
                    <select
                      name="reason"
                      className="border-line h-9 border px-1 text-xs"
                      aria-label="Reason"
                    >
                      <option value="received">Restock received</option>
                      <option value="correction">Correction</option>
                      <option value="cycle_count_available">Stock count</option>
                      <option value="damaged">Damaged</option>
                    </select>
                  </ActionForm>
                ) : !row.tracked ? (
                  <span className="text-xs text-neutral-500">Not tracked</span>
                ) : null}
              </Td>
            </tr>
          )),
        )}
      </Table>
      {pageInfo.hasNextPage && (
        <Link
          href={`/admin/inventory?${new URLSearchParams({ ...(q ? { q } : {}), after: pageInfo.endCursor ?? '' })}`}
          className="self-start text-sm underline"
        >
          Next page →
        </Link>
      )}
    </AdminPage>
  );
}
