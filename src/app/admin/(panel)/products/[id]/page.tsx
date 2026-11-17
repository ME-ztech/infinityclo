import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ProductFields } from '@/components/admin/ProductFields';
import {
  Badge,
  Button,
  Card,
  ConfirmField,
  Disconnected,
  Flash,
  LinkButton,
  PageHeader,
  SelectField,
  TableWrap,
  TextArea,
  TextField,
  formatMoney,
  inputClass,
  td,
  th,
} from '@/components/admin/ui';
import { SIZE_CHARTS, defaultSizeChartFor } from '@/domain/size-charts';
import { htmlToText } from '@/domain/text';
import { REQUIRED_ADMIN_SCOPES, getGateway } from '@/server/admin/gateway';
import { requirePage, type SearchParams } from '@/server/admin/page';
import { can } from '@/server/admin/permissions';
import { getProductContent } from '@/server/cms';

import {
  addProductImageAction,
  duplicateProductAction,
  saveProductContentAction,
  setProductStatusAction,
  updateProductAction,
  updateVariantsAction,
} from '../../../actions/commerce';

export const metadata: Metadata = { title: 'Edit product' };

const STATUS_TONE = { ACTIVE: 'good', DRAFT: 'warn', ARCHIVED: 'neutral' } as const;
const STATUS_LABEL = { ACTIVE: 'Published', DRAFT: 'Draft', ARCHIVED: 'Archived' } as const;
const dollars = (amount: number | undefined | null) => (amount === null || amount === undefined ? '' : (amount / 100).toFixed(2));

export default async function AdminProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const session = await requirePage('products.view');
  const { id } = await params;
  const flash = await searchParams;
  const gateway = await getGateway();
  if (!gateway) {
    return (
      <>
        <PageHeader title="Product" />
        <Disconnected module="Products" scopes={REQUIRED_ADMIN_SCOPES} />
      </>
    );
  }

  const product = await gateway.getProduct(decodeURIComponent(id));
  if (!product) notFound();
  const canEdit = can(session.role, 'products.edit');
  const content = await getProductContent(product.handle);
  const suggestedChart = defaultSizeChartFor({ name: product.title, category: product.productType || null });
  const external = gateway.externalUrl('product', product.id);
  const isSandboxOnly = gateway.mode === 'sandbox' && product.id.startsWith('sbx_');

  return (
    <>
      <PageHeader
        title={product.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[product.status]} testId="product-status-badge">{STATUS_LABEL[product.status]}</Badge>
            <span>Handle: <code className="font-mono">{product.handle}</code> (fixed once created, so links keep working)</span>
          </span>
        }
        actions={
          <>
            <LinkButton href="/admin/products">All products</LinkButton>
            {product.status === 'ACTIVE' && !isSandboxOnly && <LinkButton href={`/products/${product.handle}`} external testId="view-on-storefront">View on storefront</LinkButton>}
            {external && <LinkButton href={external} external>Open in Shopify</LinkButton>}
          </>
        }
      />
      <Flash params={flash} />
      {isSandboxOnly && (
        <p className="mb-5 border border-amber-600 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          This product exists only in the sandbox. It is not on the storefront and never will be: connect the Shopify
          Admin API to create real products.
        </p>
      )}

      <form action={updateProductAction} data-testid="product-edit-form">
        <input type="hidden" name="id" value={product.id} />
        <Card title="Details">
          <ProductFields
            disabled={!canEdit}
            values={{
              title: product.title,
              description: htmlToText(product.descriptionHtml) ?? '',
              productType: product.productType,
              vendor: product.vendor,
              tags: product.tags.join(', '),
              status: product.status,
              seoTitle: product.seoTitle,
              seoDescription: product.seoDescription,
            }}
          />
          {canEdit && <div className="mt-4"><Button testId="product-save">Save details</Button></div>}
        </Card>
      </form>

      <Card title="Publishing" id="publishing" description="Published products are visible and purchasable. Draft and archived products are hidden from customers.">
        {!canEdit ? (
          <p className="text-sm text-neutral-600">Your role can view products but not change them.</p>
        ) : (
          <div className="flex flex-wrap items-end gap-6">
            {product.status !== 'ACTIVE' && (
              <form action={setProductStatusAction}>
                <input type="hidden" name="id" value={product.id} />
                <input type="hidden" name="status" value="ACTIVE" />
                <Button testId="product-publish">Publish</Button>
              </form>
            )}
            {product.status === 'ACTIVE' && (
              <form action={setProductStatusAction}>
                <input type="hidden" name="id" value={product.id} />
                <input type="hidden" name="status" value="DRAFT" />
                <Button variant="secondary" testId="product-unpublish">Unpublish (back to draft)</Button>
              </form>
            )}
            {product.status !== 'ARCHIVED' && (
              <form action={setProductStatusAction} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="id" value={product.id} />
                <input type="hidden" name="status" value="ARCHIVED" />
                <ConfirmField word="ARCHIVE" id="archive-confirm" />
                <Button variant="danger" testId="product-archive">Archive</Button>
              </form>
            )}
          </div>
        )}
      </Card>

      <Card title="Variants, prices and SKUs" id="variants" description="Prices in CAD. Stock is managed in Inventory, where each change is checked against the current count.">
        <form action={updateVariantsAction}>
          <input type="hidden" name="id" value={product.id} />
          <TableWrap label="Variants">
            <thead>
              <tr>
                <th className={th}>Variant</th>
                <th className={th}>Price</th>
                <th className={th}>Compare-at</th>
                <th className={th}>SKU</th>
                <th className={th}>Barcode</th>
                <th className={th}>Weight (g)</th>
                <th className={th}>Available</th>
              </tr>
            </thead>
            <tbody>
              {product.variants.map((variant) => (
                <tr key={variant.id} data-testid="variant-row">
                  <td className={td}>
                    <input type="hidden" name="variantId" value={variant.id} />
                    <span className="font-semibold">{variant.title}</span>
                    <span className="block text-xs text-neutral-600">{formatMoney(variant.price)}</span>
                  </td>
                  <td className={td}><input aria-label={`Price for ${variant.title}`} name={`price:${variant.id}`} defaultValue={dollars(variant.price.amount)} required inputMode="decimal" pattern="\d{1,7}(\.\d{1,2})?" disabled={!canEdit} className={`${inputClass} w-24`} /></td>
                  <td className={td}><input aria-label={`Compare-at price for ${variant.title}`} name={`compare:${variant.id}`} defaultValue={dollars(variant.compareAtPrice?.amount)} inputMode="decimal" pattern="\d{1,7}(\.\d{1,2})?" disabled={!canEdit} className={`${inputClass} w-24`} /></td>
                  <td className={td}><input aria-label={`SKU for ${variant.title}`} name={`sku:${variant.id}`} defaultValue={variant.sku ?? ''} maxLength={60} disabled={!canEdit} className={`${inputClass} w-36`} /></td>
                  <td className={td}><input aria-label={`Barcode for ${variant.title}`} name={`barcode:${variant.id}`} defaultValue={variant.barcode ?? ''} maxLength={60} disabled={!canEdit} className={`${inputClass} w-36`} /></td>
                  <td className={td}><input aria-label={`Weight in grams for ${variant.title}`} name={`weight:${variant.id}`} defaultValue={variant.weightGrams ?? ''} inputMode="numeric" pattern="\d{0,6}" disabled={!canEdit} className={`${inputClass} w-24`} /></td>
                  <td className={`${td} tabular-nums`}>{variant.inventoryQuantity === null ? 'Not tracked' : variant.inventoryQuantity}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          {canEdit && <div className="mt-4"><Button testId="variants-save">Save variants</Button></div>}
        </form>
        <p className="mt-3 text-xs leading-relaxed text-neutral-600">
          Adding or removing sizes and colours on an existing product is done in Shopify (Open in Shopify → Variants),
          because removing a variant also removes its sales history links and stock records.
        </p>
      </Card>

      <Card title="Photos" id="media">
        {product.media.length === 0 ? (
          <p className="text-sm text-neutral-600">No photos yet. A product should not be published without one.</p>
        ) : (
          <ul className="flex flex-wrap gap-3">
            {product.media.map((media) => (
              <li key={media.id} className="w-24">
                {/* eslint-disable-next-line @next/next/no-img-element -- operator preview of arbitrary catalogue media */}
                <img src={media.url} alt={media.alt || 'Product photo with no description'} width={96} height={96} loading="lazy" className="size-24 border border-neutral-200 bg-neutral-50 object-cover" />
                {!media.alt && <span className="mt-1 block text-[0.65rem] font-bold text-red-800">No alt text</span>}
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <form action={addProductImageAction} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <input type="hidden" name="id" value={product.id} />
            <TextField label="Image link" name="imageUrl" type="url" required placeholder="https://…/photo.jpg" hint="An https link to a JPG, PNG or WebP you own." />
            <TextField label="Description (alt text)" name="imageAlt" required maxLength={200} hint="What the photo shows." />
            <Button variant="secondary">Add image</Button>
          </form>
        )}
        <p className="mt-3 text-xs leading-relaxed text-neutral-600">
          To upload files from your computer, reorder photos, or add video, use Shopify
          {external ? ' (Open in Shopify → Media)' : ''}. Uploads go straight to Shopify’s storage, so this dashboard
          never handles original files.
        </p>
      </Card>

      <Card title="Fit, fabric, care and size guide" id="content" description="Shown as expandable sections on the product page. Leave a field empty to hide that section — never fill one with a guess.">
        <form action={saveProductContentAction} className="grid gap-4 md:grid-cols-2">
          <input type="hidden" name="id" value={product.id} />
          <input type="hidden" name="slug" value={product.handle} />
          <TextArea label="Fit" name="fit" defaultValue={content?.fit ?? ''} maxLength={1200} disabled={!canEdit} />
          <TextArea label="Fabric" name="fabric" defaultValue={content?.fabric ?? ''} maxLength={1200} disabled={!canEdit} />
          <TextArea label="Care" name="care" defaultValue={content?.care ?? ''} maxLength={1200} disabled={!canEdit} />
          <SelectField
            label="Size chart"
            name="sizeChart"
            defaultValue={content?.sizeChart ?? ''}
            disabled={!canEdit}
            options={[
              { value: '', label: suggestedChart ? `Automatic (${SIZE_CHARTS[suggestedChart].title})` : 'None — no brand chart exists for this garment' },
              ...Object.values(SIZE_CHARTS).map((chart) => ({ value: chart.id, label: chart.title })),
            ]}
            hint="Only INFNITY’s four published charts are available. Send new measurements to add a chart (for example a women’s guide)."
          />
          {canEdit && <div className="md:col-span-2"><Button variant="secondary" testId="content-save">Save product content</Button></div>}
        </form>
      </Card>

      {canEdit && (
        <Card title="Duplicate" description="Creates a draft copy with the same options, prices and photos, and zero stock.">
          <form action={duplicateProductAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="id" value={product.id} />
            <TextField label="Title for the copy" name="newTitle" required maxLength={255} defaultValue={`${product.title} (copy)`} wrapClass="min-w-64 flex-1" />
            <Button variant="secondary" testId="product-duplicate">Duplicate as draft</Button>
          </form>
        </Card>
      )}
    </>
  );
}
