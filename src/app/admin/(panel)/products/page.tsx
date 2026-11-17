import Image from 'next/image';
import Link from 'next/link';

import { AdminPage, Badge, formatCad, formatDate, NotConnected, Table, Td } from '@/components/admin/ui';
import { catalogRepository } from '@/data';
import { formatMoney } from '@/domain/money';
import { can } from '@/domain/rbac';
import { fromPrice, isSoldOut, primaryMedia } from '@/domain/product';
import { requireStaffPage } from '@/server/auth/staff';
import { isAdminConfigured } from '@/server/shopify/config';
import { listProducts } from '@/server/shopify/admin';

export const metadata = { title: 'Products' };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; after?: string }> }) {
  const session = await requireStaffPage('products:read', '/admin/products');
  const { q, after } = await searchParams;
  const canWrite = can(session.user.role, 'products:write');

  if (!isAdminConfigured()) {
    const { products } = await catalogRepository.listProducts({ sort: 'newest' });
    return (
      <AdminPage title="Products" description="Imported snapshot of the live catalogue (read-only).">
        <NotConnected what="Creating and editing products" envVar="SHOPIFY_ADMIN_ACCESS_TOKEN" scopes="read_products, write_products, write_publications" />
        <Table head={['', 'Product', 'Availability', 'Variants', 'From', 'Storefront']}>
          {products.map((product) => {
            const media = primaryMedia(product);
            const price = fromPrice(product);
            return (
              <tr key={product.slug}>
                <Td>{media && <Image src={media.url} alt="" width={48} height={48} className="h-12 w-12 object-cover" />}</Td>
                <Td className="font-medium">{product.name}</Td>
                <Td>{isSoldOut(product) ? <Badge tone="bad">Sold out</Badge> : <Badge tone="good">Available</Badge>}</Td>
                <Td>{product.variants.length}</Td>
                <Td>{price ? formatMoney(price) : '—'}</Td>
                <Td>
                  <Link href={`/products/${product.slug}`} className="underline" target="_blank">
                    View
                  </Link>
                </Td>
              </tr>
            );
          })}
        </Table>
      </AdminPage>
    );
  }

  const { products, pageInfo } = await listProducts(q ?? null, after ?? null);
  return (
    <AdminPage
      title="Products"
      description="Live from Shopify. Changes save to Shopify and appear on the storefront within seconds."
      actions={canWrite && <Link href="/admin/products/new" className="bg-ink text-paper hover:bg-signal inline-flex h-10 items-center px-4 text-xs font-semibold uppercase">New product</Link>}
    >
      <form className="flex gap-2">
        <input name="q" defaultValue={q} placeholder="Search title, SKU, tag…" className="border-line h-10 w-full max-w-sm border bg-white px-3 text-sm" aria-label="Search products" />
        <button className="border-ink h-10 border px-4 text-xs font-semibold uppercase">Search</button>
      </form>
      <Table head={['', 'Product', 'Status', 'Stock', 'Variants', 'From', 'Updated']} empty={products.length ? undefined : 'No products match.'}>
        {products.map((product) => (
          <tr key={product.id}>
            <Td>{product.featuredImage && <Image src={product.featuredImage.split('?')[0]!} alt="" width={48} height={48} className="h-12 w-12 object-cover" />}</Td>
            <Td>
              <Link href={`/admin/products/${product.id.split('/').pop()}`} className="font-medium underline-offset-4 hover:underline">
                {product.title}
              </Link>
            </Td>
            <Td>
              <Badge tone={product.status === 'ACTIVE' ? 'good' : product.status === 'DRAFT' ? 'warn' : 'neutral'}>{product.status}</Badge>
            </Td>
            <Td>{product.totalInventory ?? '—'}</Td>
            <Td>{product.variantsCount}</Td>
            <Td>{product.minPrice ? formatCad(product.minPrice.amount, product.minPrice.currencyCode) : '—'}</Td>
            <Td>{formatDate(product.updatedAt)}</Td>
          </tr>
        ))}
      </Table>
      {pageInfo.hasNextPage && (
        <Link href={`/admin/products?${new URLSearchParams({ ...(q ? { q } : {}), after: pageInfo.endCursor ?? '' })}`} className="self-start text-sm underline">
          Next page →
        </Link>
      )}
    </AdminPage>
  );
}
