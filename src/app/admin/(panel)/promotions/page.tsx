import Link from 'next/link';

import { AdminPage, Badge, Card, formatDate, Table, Td } from '@/components/admin/ui';
import { can } from '@/domain/rbac';
import { requireStaffPage } from '@/server/auth/staff';
import { listPromotions } from '@/server/promotions';
import { isAdminConfigured } from '@/server/shopify/config';
import { listLiveDiscounts } from '@/server/shopify/admin';

export const metadata = { title: 'Promotions' };

const STATUS_TONE = { draft: 'warn', approved: 'info', live: 'good', paused: 'neutral', ended: 'neutral' } as const;

export default async function PromotionsPage() {
  const session = await requireStaffPage('promotions:read', '/admin/promotions');
  const [promotions, live] = await Promise.all([listPromotions(), isAdminConfigured() ? listLiveDiscounts().catch(() => null) : Promise.resolve(null)]);
  return (
    <AdminPage
      title="Promotions"
      description="Drafts live here. Only the owner can approve (with a margin check) and publish; publishing creates a real Shopify discount so checkout totals always match. Shoppers only ever see live offers."
      actions={can(session.user.role, 'promotions:write') && <Link href="/admin/promotions/new" className="bg-ink text-paper hover:bg-signal inline-flex h-10 items-center px-4 text-xs font-semibold uppercase">New draft</Link>}
    >
      <Table head={['Promotion', 'Type', 'Status', 'Applies', 'Updated']}>
        {promotions.map((promotion) => (
          <tr key={promotion.id}>
            <Td>
              <Link href={`/admin/promotions/${promotion.id}`} className="font-medium underline-offset-4 hover:underline">
                {promotion.name}
              </Link>
              <p className="text-xs text-neutral-500">{promotion.config.title}</p>
            </Td>
            <Td>{promotion.config.kind.replace(/_/g, ' ')}</Td>
            <Td>
              <Badge tone={STATUS_TONE[promotion.status]}>{promotion.status}</Badge>
              {promotion.shopifySyncError && <p className="text-signal text-xs">Sync error</p>}
            </Td>
            <Td>{promotion.config.method === 'code' ? `Code ${promotion.config.code || '(not set)'}` : 'Automatic'}</Td>
            <Td>{formatDate(promotion.updatedAt)}</Td>
          </tr>
        ))}
      </Table>
      <Card title="Discounts currently in Shopify">
        {live === null ? (
          <p className="text-sm text-neutral-600">Connect the Admin API (read_discounts) to list the store’s existing Shopify discounts, including the FREESKII codes used by the AVADA gift app.</p>
        ) : live.length === 0 ? (
          <p className="text-sm text-neutral-600">No discounts in Shopify.</p>
        ) : (
          <ul className="divide-line divide-y text-sm">
            {live.map((node) => (
              <li key={node.id} className="flex justify-between py-2">
                <span>{node.discount.title}</span>
                <span>
                  <Badge tone={node.discount.status === 'ACTIVE' ? 'good' : 'neutral'}>{node.discount.status}</Badge> {node.discount.asyncUsageCount ?? 0} uses
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </AdminPage>
  );
}
