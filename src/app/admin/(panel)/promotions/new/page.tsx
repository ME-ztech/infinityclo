import { ActionForm } from '@/components/admin/ActionForm';
import { PromotionFields } from '@/components/admin/PromotionFields';
import { AdminPage } from '@/components/admin/ui';
import { requireStaffPage } from '@/server/auth/staff';

import { saveDraftAction } from '../actions';

export const metadata = { title: 'New promotion' };

export default async function NewPromotionPage() {
  await requireStaffPage('promotions:write', '/admin/promotions/new');
  return (
    <AdminPage title="New promotion draft" description="Drafts are invisible to shoppers.">
      <div className="border-line border bg-white p-5">
        <ActionForm action={saveDraftAction} submitLabel="Save draft">
          <PromotionFields name="" config={null} />
        </ActionForm>
      </div>
    </AdminPage>
  );
}
