import type { Metadata } from 'next';
import Link from 'next/link';

import { Badge, Button, Disconnected, Empty, Flash, LinkButton, PageHeader, TableWrap, formatDate, formatMoney, inputClass, td, th } from '@/components/admin/ui';
import { REQUIRED_ADMIN_SCOPES, getGateway, type AdminProductSummary, type ProductStatus } from '@/server/admin/gateway';
import { param, requirePage, type SearchParams } from '@/server/admin/page';
import { can } from '@/server/admin/permissions';

export const metadata: Metadata = { title: 'Products' };

const STATUS_TONE = { ACTIVE: 'good', DRAFT: 'warn', ARCHIVED: 'neutral' } as const;
const STATUS_LABEL = { ACTIVE: 'Published', DRAFT: 'Draft', ARCHIVED: 'Archived' } as const;

export default async function AdminProductsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requirePage('products.view');
  const params = await searchParams;
  const search = param(params, 'q');
  const statusParam = param(params, 'status');
  const status = (['ACTIVE', 'DRAFT', 'ARCHIVED'].includes(statusParam) ? statusParam : '') as ProductStatus | '';
  const gateway = await getGateway();
  const canEdit = can(session.role, 'products.edit');

  let products: AdminProductSummary[] = [];
  let error: string | null = null;
  if (gateway) {
    try {
      products = await gateway.listProducts({ search, status });
    } catch (caught) {
      error = (caught as Error).message;
    }
  }

  return (
    <>
      <PageHeader
        title="Products"
        description={gateway ? `Source: ${gateway.sourceLabel}. Changes are saved there and appear on the storefront within a minute.` : undefined}
        actions={gateway && canEdit ? <LinkButton href="/admin/products/new" variant="primary" testId="product-new">Add product</LinkButton> : undefined}
      />
      <Flash params={params} />
      {!gateway ? (
        <Disconnected module="Products" scopes={REQUIRED_ADMIN_SCOPES} />
      ) : (
        <>
          <form method="get" className="mb-4 flex flex-wrap items-end gap-3" role="search" aria-label="Filter products">
            <div className="min-w-56 flex-1">
              <label htmlFor="q" className="mb-1 block text-xs font-semibold uppercase">Search</label>
              <input id="q" name="q" defaultValue={search} placeholder="Title, handle or SKU" className={inputClass} />
            </div>
            <div>
              <label htmlFor="status" className="mb-1 block text-xs font-semibold uppercase">Status</label>
              <select id="status" name="status" defaultValue={status} className={inputClass}>
                <option value="">All</option>
                <option value="ACTIVE">Published</option>
                <option value="DRAFT">Draft</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </div>
            <Button variant="secondary">Filter</Button>
          </form>

          {error && <p role="alert" className="mb-4 border border-red-700 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</p>}

          {products.length === 0 && !error ? (
            <Empty title="No products match">Clear the filters, or add a product.</Empty>
          ) : (
            <TableWrap label="Products">
              <thead>
                <tr>
                  <th className={th}>Product</th>
                  <th className={th}>Status</th>
                  <th className={th}>Price</th>
                  <th className={th}>Stock</th>
                  <th className={th}>Variants</th>
                  <th className={th}>Updated</th>
                </tr>
              </thead>
              <tbody data-testid="product-rows">
                {products.map((product) => (
                  <tr key={product.id} data-testid="product-row">
                    <td className={td}>
                      <Link href={`/admin/products/${product.id}`} className="flex items-center gap-3 font-semibold underline-offset-4 hover:underline">
                        {product.image ? (
                          // eslint-disable-next-line @next/next/no-img-element -- operator thumbnail; may be any Shopify CDN size
                          <img src={product.image.url} alt="" width={40} height={40} loading="lazy" className="size-10 shrink-0 border border-neutral-200 bg-neutral-50 object-cover" />
                        ) : (
                          <span aria-hidden className="size-10 shrink-0 border border-dashed border-neutral-300 bg-neutral-50" />
                        )}
                        <span>{product.title}</span>
                      </Link>
                    </td>
                    <td className={td}><Badge tone={STATUS_TONE[product.status]}>{STATUS_LABEL[product.status]}</Badge></td>
                    <td className={`${td} tabular-nums`}>
                      {product.priceMin && product.priceMax && product.priceMin.amount !== product.priceMax.amount
                        ? `${formatMoney(product.priceMin)} – ${formatMoney(product.priceMax)}`
                        : formatMoney(product.priceMin)}
                    </td>
                    <td className={`${td} tabular-nums`}>{product.totalInventory === null ? 'Not tracked' : product.totalInventory}</td>
                    <td className={`${td} tabular-nums`}>{product.variantCount}</td>
                    <td className={td}>{formatDate(product.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </>
      )}
    </>
  );
}
