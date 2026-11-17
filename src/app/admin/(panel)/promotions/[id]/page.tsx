import { notFound } from 'next/navigation';

import { ActionForm } from '@/components/admin/ActionForm';
import { PromotionFields } from '@/components/admin/PromotionFields';
import { AdminPage, Badge, Card, formatDate } from '@/components/admin/ui';
import { approvalProblems, isSitewidePersistent, shopifyDiscountPlan } from '@/domain/promotions';
import { can } from '@/domain/rbac';
import { requireStaffPage } from '@/server/auth/staff';
import { getPromotion } from '@/server/promotions';
import { isAdminConfigured } from '@/server/shopify/config';

import { approveAction, deleteDraftAction, endAction, pauseAction, publishAction, saveDraftAction } from '../actions';

export const metadata = { title: 'Promotion' };

export default async function PromotionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireStaffPage('promotions:read', `/admin/promotions/${id}`);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const promotion = await getPromotion(id);
  if (!promotion) notFound();
  const role = session.user.role;
  const isDraft = promotion.status === 'draft';
  const problems = approvalProblems(promotion.config, true);
  const plan = shopifyDiscountPlan(promotion.config);
  return (
    <AdminPage title={promotion.name} description={<span className="flex items-center gap-2"><Badge>{promotion.status}</Badge> Updated {formatDate(promotion.updatedAt)}{promotion.approvedBy && ` · approved by ${promotion.approvedBy}`}</span>}>
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card title={isDraft ? 'Edit draft' : 'Details (read-only once approved)'}>
          {isDraft && can(role, 'promotions:write') ? (
            <ActionForm action={saveDraftAction} submitLabel="Save draft">
              <input type="hidden" name="id" value={promotion.id} />
              <PromotionFields name={promotion.name} config={promotion.config} />
            </ActionForm>
          ) : (
            <PromotionFields name={promotion.name} config={promotion.config} readOnly />
          )}
        </Card>
        <div className="flex flex-col gap-6">
          {isDraft && (
            <Card title="Owner approval">
              {problems.length > 0 && (
                <ul className="mb-3 list-disc pl-5 text-sm text-amber-900">
                  {problems.map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
              )}
              {isSitewidePersistent(promotion.config) && (
                <p className="text-signal mb-3 text-sm font-semibold">This is an always-on, sitewide offer. Check margins on every product before approving.</p>
              )}
              {can(role, 'promotions:approve') ? (
                <ActionForm action={approveAction} submitLabel="Approve" confirm="Approve this promotion? It still won't be live until you publish it.">
                  <input type="hidden" name="id" value={promotion.id} />
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" name="margin" /> I have checked the margin impact of this offer on the products it applies to.
                  </label>
                </ActionForm>
              ) : (
                <p className="text-sm text-neutral-600">Only the owner can approve promotions.</p>
              )}
            </Card>
          )}
          {promotion.status === 'approved' && can(role, 'promotions:approve') && (
            <Card title="Publish to Shopify">
              <p className="mb-3 text-sm text-neutral-600">
                Creates a {plan.mutation.replace(/Create$/, '').replace(/^discount/, '').replace(/([A-Z])/g, ' $1').trim().toLowerCase()} discount in Shopify
                {plan.needsFirstOrderSegment ? ' limited to customers with no orders' : ''}. Shoppers see it immediately.
              </p>
              {!isAdminConfigured() && <p className="mb-3 text-sm text-amber-900">Needs the Shopify Admin API (write_discounts) — publishing will be refused until it is connected.</p>}
              <ActionForm action={publishAction} submitLabel="Publish to Shopify" confirm="Create this discount in your live Shopify store now?">
                <input type="hidden" name="id" value={promotion.id} />
              </ActionForm>
              {promotion.shopifySyncError && <p className="text-signal mt-2 text-xs">Last attempt: {promotion.shopifySyncError}</p>}
            </Card>
          )}
          {(promotion.status === 'live' || promotion.status === 'paused') && can(role, 'promotions:approve') && (
            <Card title="Live controls">
              <ActionForm action={pauseAction} submitLabel={promotion.status === 'live' ? 'Pause' : 'Resume'} variant="secondary">
                <input type="hidden" name="id" value={promotion.id} />
                <input type="hidden" name="paused" value={promotion.status === 'live' ? 'true' : 'false'} />
              </ActionForm>
              <div className="mt-3">
                <ActionForm action={endAction} submitLabel="End promotion" variant="danger" confirm="End this promotion and deactivate its Shopify discount?">
                  <input type="hidden" name="id" value={promotion.id} />
                </ActionForm>
              </div>
            </Card>
          )}
          {isDraft && can(role, 'promotions:write') && (
            <Card title="Delete draft">
              <ActionForm action={deleteDraftAction} submitLabel="Delete draft" variant="danger" confirm="Delete this draft?">
                <input type="hidden" name="id" value={promotion.id} />
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </AdminPage>
  );
}
