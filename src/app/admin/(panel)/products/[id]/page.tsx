import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ActionForm } from '@/components/admin/ActionForm';
import { ProductEditor } from '@/components/admin/ProductEditor';
import { AdminPage, Badge, NotConnected } from '@/components/admin/ui';
import { htmlToText } from '@/domain/product-copy';
import { can } from '@/domain/rbac';
import { editorContext } from '@/server/admin/product-editor-data';
import { requireStaffPage } from '@/server/auth/staff';
import { isAdminConfigured } from '@/server/shopify/config';
import { getProduct, shopifyAdminUrl } from '@/server/shopify/admin';

import { duplicateAction, saveProductAction, setStatusAction, uploadImageAction } from '../actions';

export const metadata = { title: 'Edit product' };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireStaffPage('products:read', `/admin/products/${id}`);
  if (!/^\d+$/.test(id)) notFound();
  if (!isAdminConfigured()) {
    return (
      <AdminPage title="Edit product">
        <NotConnected what="Editing products" envVar="SHOPIFY_ADMIN_ACCESS_TOKEN" scopes="write_products" />
      </AdminPage>
    );
  }
  const [product, context] = await Promise.all([getProduct(id), editorContext()]);
  if (!product) notFound();
  const role = session.user.role;
  return (
    <AdminPage
      title={product.title}
      description={
        <span className="flex flex-wrap items-center gap-2">
          <Badge tone={product.status === 'ACTIVE' ? 'good' : 'warn'}>{product.status}</Badge>
          <Link href={`/products/${product.handle}`} target="_blank" className="underline">
            View on storefront
          </Link>
          <a href={shopifyAdminUrl(`products/${id}`)} target="_blank" rel="noopener noreferrer" className="underline">
            Open in Shopify admin
          </a>
        </span>
      }
    >
      {can(role, 'products:write') ? (
        <ProductEditor
          product={{
            id,
            title: product.title,
            handle: product.handle,
            description: htmlToText(product.descriptionHtml)?.replace(/^• /gm, '') ?? '',
            productType: product.productType,
            vendor: product.vendor,
            status: product.status === 'UNLISTED' ? 'DRAFT' : product.status,
            tags: product.tags,
            seoTitle: product.seo.title ?? '',
            seoDescription: product.seo.description ?? '',
            options: product.options.map((option) => ({ name: option.name, values: option.values })),
            variants: product.variants.map((variant) => ({
              id: variant.id.split('/').pop() ?? variant.id,
              optionValues: variant.selectedOptions.map((option) => ({ optionName: option.name, name: option.value })),
              price: variant.price,
              compareAtPrice: variant.compareAtPrice,
              sku: variant.sku,
              barcode: variant.barcode,
              weightGrams: variant.weight?.unit === 'GRAMS' ? variant.weight.value : null,
            })),
            media: product.media,
            facts: { fit: product.metafields.fit ?? '', fabric: product.metafields.fabric ?? '', care: product.metafields.care ?? '', sizeGuide: product.metafields.size_guide ?? '' },
          }}
          canPublish={can(role, 'products:publish')}
          {...context}
          saveAction={saveProductAction}
          uploadAction={uploadImageAction}
        />
      ) : (
        <p className="text-sm text-neutral-600">Your role can view products but not edit them.</p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {can(role, 'products:write') && (
          <div className="border-line border bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase">Duplicate</h2>
            <ActionForm action={duplicateAction} submitLabel="Duplicate as draft" variant="secondary">
              <input type="hidden" name="id" value={id} />
              <input name="title" defaultValue={`${product.title} (copy)`} className="border-line h-10 border px-3 text-sm" aria-label="Title for the copy" />
            </ActionForm>
          </div>
        )}
        {can(role, 'products:publish') && (
          <div className="border-line border bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase">Status</h2>
            <div className="flex flex-wrap gap-2">
              {(['DRAFT', 'ARCHIVED'] as const)
                .filter((status) => status !== product.status)
                .map((status) => (
                  <ActionForm key={status} action={setStatusAction} submitLabel={status === 'ARCHIVED' ? 'Archive' : 'Move to draft'} variant={status === 'ARCHIVED' ? 'danger' : 'secondary'} confirm={`Set this product to ${status.toLowerCase()}? It will no longer be sold on the storefront.`}>
                    <input type="hidden" name="id" value={id} />
                    <input type="hidden" name="status" value={status} />
                  </ActionForm>
                ))}
            </div>
          </div>
        )}
      </div>
    </AdminPage>
  );
}
