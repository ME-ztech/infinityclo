import type { Metadata } from 'next';
import Link from 'next/link';

import { createDropAction } from '@/app/admin/actions/local';
import { Badge, Button, Card, Empty, Flash, PageHeader, TableWrap, TextField, formatDate, td, th } from '@/components/admin/ui';
import { requirePage, type SearchParams } from '@/server/admin/page';
import { listDrops, listWaitlist, type DropStage } from '@/server/records';

export const metadata: Metadata = { title: 'Drops' };

const STAGE: Record<DropStage, { label: string; tone: 'neutral' | 'good' | 'warn' | 'bad' | 'solid' }> = {
  draft: { label: 'Draft — not public', tone: 'neutral' },
  coming_soon: { label: 'Coming soon — public teaser', tone: 'warn' },
  early_access: { label: 'Early access', tone: 'warn' },
  published: { label: 'Published', tone: 'good' },
  sold_out: { label: 'Sold out', tone: 'bad' },
  archived: { label: 'Archived', tone: 'neutral' },
};

export default async function AdminDropsPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePage('drops.edit');
  const params = await searchParams;
  const [drops, waitlist] = await Promise.all([listDrops(), listWaitlist()]);
  const counts = new Map<string, number>();
  for (const entry of waitlist) counts.set(entry.dropId, (counts.get(entry.dropId) ?? 0) + 1);

  return (
    <>
      <PageHeader
        title="Drops"
        description="A drop is the teaser and waitlist around an upcoming product. Nothing about it is public until you move it to “coming soon”, and even then only the details you have filled in are shown."
      />
      <Flash params={params} />

      <Card title="Start a drop" description="Only an internal working name is needed. It is never shown to customers.">
        <form action={createDropAction} className="flex flex-wrap items-end gap-3" data-testid="drop-create-form">
          <TextField label="Internal name" name="internalName" required maxLength={80} wrapClass="min-w-64 flex-1" placeholder="Winter outerwear" />
          <Button testId="drop-create">Create draft</Button>
        </form>
      </Card>

      {drops.length === 0 ? (
        <Empty title="No drops yet">The homepage “coming soon” section stays hidden until a drop is moved to coming soon.</Empty>
      ) : (
        <TableWrap label="Drops">
          <thead>
            <tr>
              <th className={th}>Drop</th>
              <th className={th}>Stage</th>
              <th className={th}>Release</th>
              <th className={th}>Waitlist</th>
              <th className={th}>Updated</th>
            </tr>
          </thead>
          <tbody>
            {drops.map((drop) => (
              <tr key={drop.id} data-testid="drop-row">
                <td className={td}>
                  <Link href={`/admin/drops/${drop.id}`} className="font-semibold underline underline-offset-4">
                    {drop.internalName}
                  </Link>
                  {drop.publicName && <span className="block text-xs text-neutral-600">Public name: {drop.publicName}</span>}
                </td>
                <td className={td}><Badge tone={STAGE[drop.stage].tone}>{STAGE[drop.stage].label}</Badge></td>
                <td className={td}>
                  {drop.releaseAt ? formatDate(drop.releaseAt) : 'Not set'}
                  {drop.releaseAt && !drop.releaseConfirmed && <span className="block text-xs text-neutral-600">Not confirmed — hidden from customers</span>}
                </td>
                <td className={`${td} tabular-nums`}>{counts.get(drop.id) ?? 0}</td>
                <td className={td}>{formatDate(drop.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </>
  );
}
