import { ProductEditor } from '@/components/admin/ProductEditor';
import { AdminPage, NotConnected } from '@/components/admin/ui';
import { can } from '@/domain/rbac';
import { editorContext } from '@/server/admin/product-editor-data';
import { requireStaffPage } from '@/server/auth/staff';
import { isAdminConfigured } from '@/server/shopify/config';

import { saveProductAction, uploadImageAction } from '../actions';

export const metadata = { title: 'New product' };

export default async function NewProductPage() {
  const session = await requireStaffPage('products:write', '/admin/products/new');
  if (!isAdminConfigured()) {
    return (
      <AdminPage title="New product">
        <NotConnected
          what="Creating products"
          envVar="SHOPIFY_ADMIN_ACCESS_TOKEN"
          scopes="write_products, write_inventory, write_publications"
        />
      </AdminPage>
    );
  }
  const context = await editorContext();
  return (
    <AdminPage
      title="New product"
      description="Saved to Shopify as a draft until you publish. Add stock now or later under Inventory."
    >
      <ProductEditor
        product={{
          id: null,
          title: '',
          handle: '',
          description: '',
          productType: '',
          vendor: 'Infnity.clo',
          status: 'DRAFT',
          tags: [],
          seoTitle: '',
          seoDescription: '',
          options: [],
          variants: [],
          media: [],
          facts: { fit: '', fabric: '', care: '', sizeGuide: '' },
        }}
        canPublish={can(session.user.role, 'products:publish')}
        {...context}
        saveAction={saveProductAction}
        uploadAction={uploadImageAction}
      />
    </AdminPage>
  );
}
