import type { Metadata } from 'next';

import { ProductFields } from '@/components/admin/ProductFields';
import { Button, Card, Disconnected, Flash, LinkButton, PageHeader, TextField } from '@/components/admin/ui';
import { REQUIRED_ADMIN_SCOPES, getGateway } from '@/server/admin/gateway';
import { requirePage, type SearchParams } from '@/server/admin/page';

import { createProductAction } from '../../../actions/commerce';

export const metadata: Metadata = { title: 'Add product' };

export default async function AdminNewProductPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePage('products.edit');
  const params = await searchParams;
  const gateway = await getGateway();

  return (
    <>
      <PageHeader
        title="Add product"
        description="Creates the product in the commerce backend with one variant per option combination. Stock starts at zero — set it in Inventory before publishing."
        actions={<LinkButton href="/admin/products">Back to products</LinkButton>}
      />
      <Flash params={params} />
      {!gateway ? (
        <Disconnected module="Products" scopes={REQUIRED_ADMIN_SCOPES} />
      ) : (
        <form action={createProductAction} data-testid="product-create-form">
          <Card title="Details">
            <ProductFields values={{ title: '', description: '', productType: '', vendor: 'Infnity.clo', tags: '', status: 'DRAFT', seoTitle: '', seoDescription: '' }} />
          </Card>

          <Card title="Price" description="In CAD. Applied to every variant; adjust individual variants after creating.">
            <div className="grid gap-4 sm:grid-cols-3">
              <TextField label="Price" name="price" inputMode="decimal" required pattern="\d{1,7}(\.\d{1,2})?" placeholder="45.00" data-testid="product-price" />
              <TextField label="Compare-at price" name="compareAtPrice" inputMode="decimal" pattern="\d{1,7}(\.\d{1,2})?" hint="Optional. Only for a genuine previous price, and it must be higher than the price." />
              <TextField label="SKU prefix" name="skuPrefix" maxLength={30} hint="Optional. Variants get PREFIX-SIZE style SKUs." />
            </div>
          </Card>

          <Card title="Options and variants" description="Up to three options, for example Size and Colour. Leave all empty for a one-size product. Values are comma-separated; one variant is created per combination (maximum 100).">
            <div className="grid gap-4">
              {[1, 2, 3].map((index) => (
                <div key={index} className="grid gap-3 sm:grid-cols-[14rem_1fr]">
                  <TextField label={`Option ${index} name`} name={`option${index}Name`} maxLength={40} placeholder={index === 1 ? 'Size' : index === 2 ? 'Colour' : ''} data-testid={`option${index}-name`} />
                  <TextField label={`Option ${index} values`} name={`option${index}Values`} maxLength={600} placeholder={index === 1 ? 'S, M, L, XL, 2XL' : ''} data-testid={`option${index}-values`} />
                </div>
              ))}
            </div>
          </Card>

          <Button testId="product-create-submit">Create product</Button>
        </form>
      )}
    </>
  );
}
