import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { deleteDropAction, transitionDropAction, updateDropAction } from '@/app/admin/actions/local';
import { toLocalInput } from '@/components/admin/OfferForm';
import { Badge, Button, Card, Checkbox, ConfirmField, Empty, Flash, LinkButton, PageHeader, TableWrap, TextArea, TextField, formatDate, td, th } from '@/components/admin/ui';
import { catalogRepository } from '@/data';
import { requirePage, type SearchParams } from '@/server/admin/page';
import { can } from '@/server/admin/permissions';
import { DROP_TRANSITIONS, getDrop, listWaitlist, type DropStage } from '@/server/records';

export const metadata: Metadata = { title: 'Drop' };

const STAGE_LABEL: Record<DropStage, string> = {
  draft: 'Draft',
  coming_soon: 'Coming soon',
  early_access: 'Early access',
  published: 'Published',
  sold_out: 'Sold out',
  archived: 'Archived',
};

const STAGE_EFFECT: Record<DropStage, string> = {
  draft: 'Takes the teaser off the storefront.',
  coming_soon: 'Shows the teaser and waitlist on the homepage.',
  early_access: 'Keeps the teaser up, labelled early access.',
  published: 'Marks the drop as released and takes the teaser down. Publishing the product itself is done in Products.',
  sold_out: 'Records that the drop sold through.',
  archived: 'Closes the drop. Its waitlist is kept for export.',
};

export default async function AdminDropPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const session = await requirePage('drops.edit');
  const { id } = await params;
  const query = await searchParams;
  const drop = await getDrop(id);
  if (!drop) notFound();

  const [waitlist, { products }] = await Promise.all([listWaitlist(drop.id), catalogRepository.listProducts()]);
  const media = [...new Map(products.flatMap((product) => product.media.map((item) => [item.url, product.name] as const))).entries()];
  const canExport = can(session.role, 'marketing.export');
  const deletable = drop.stage === 'draft' || drop.stage === 'archived';

  return (
    <>
      <PageHeader
        title={drop.internalName}
        description={`Stage: ${STAGE_LABEL[drop.stage]}. Last changed ${formatDate(drop.updatedAt)} by ${drop.updatedBy}.`}
        actions={
          <>
            <LinkButton href={`/drops/preview/${drop.previewToken}`} external testId="drop-preview">Preview teaser</LinkButton>
            <LinkButton href="/admin/drops">Back to drops</LinkButton>
          </>
        }
      />
      <Flash params={query} />

      <Card title="Stage" description="Only the moves below are possible from the current stage.">
        <div className="mb-4">
          <Badge tone={drop.stage === 'draft' || drop.stage === 'archived' ? 'neutral' : 'good'} testId="drop-stage">{STAGE_LABEL[drop.stage]}</Badge>
        </div>
        <ul className="space-y-3">
          {DROP_TRANSITIONS[drop.stage].map((stage) => (
            <li key={stage}>
              <form action={transitionDropAction} className="flex flex-wrap items-center gap-3">
                <input type="hidden" name="id" value={drop.id} />
                <input type="hidden" name="stage" value={stage} />
                <Button variant="secondary" testId={`drop-to-${stage}`}>Move to {STAGE_LABEL[stage].toLowerCase()}</Button>
                <span className="text-xs text-neutral-600">{STAGE_EFFECT[stage]}</span>
              </form>
            </li>
          ))}
        </ul>
      </Card>

      <Card
        title="What customers see"
        description="Every field is optional. The teaser shows only what is filled in — never a placeholder name, price or date. A countdown appears only when the release date is confirmed."
      >
        <datalist id="drop-media">
          {media.map(([url, label]) => (
            <option key={url} value={url}>
              {label}
            </option>
          ))}
        </datalist>
        <form action={updateDropAction} className="grid gap-4 md:grid-cols-2" data-testid="drop-form">
          <input type="hidden" name="id" value={drop.id} />
          <TextField label="Internal name" name="internalName" required maxLength={80} defaultValue={drop.internalName} hint="Staff only." />
          <TextField label="Public name" name="publicName" maxLength={80} defaultValue={drop.publicName ?? ''} hint="Leave empty until you are ready to reveal it." />
          <TextArea label="Teaser line" name="teaser" maxLength={300} rows={2} defaultValue={drop.teaser ?? ''} wrapClass="md:col-span-2" />
          <TextField label="Teaser image" name="image.url" list="drop-media" maxLength={400} defaultValue={drop.image?.url ?? ''} placeholder="/products/…/01.jpg" hint="Must already be on this site. Leave empty for a text-only teaser." />
          <TextField label="Image description (alt text)" name="image.alt" maxLength={200} defaultValue={drop.image?.alt ?? ''} hint="Required when an image is set." />
          <TextField label="Release date and time" name="releaseAt" type="datetime-local" defaultValue={toLocalInput(drop.releaseAt)} hint="In this server’s time zone." />
          <div className="self-end">
            <Checkbox label="This release date is confirmed — show it and a countdown" name="releaseConfirmed" defaultChecked={drop.releaseConfirmed} hint="Unticked, the date stays internal." />
          </div>
          <TextField label="Product handle" name="productSlug" maxLength={120} defaultValue={drop.productSlug ?? ''} hint="Once the product exists in Products. Needed before the drop can be marked published." />
          <div className="self-end">
            <Checkbox label="Collect a waitlist" name="waitlistEnabled" defaultChecked={drop.waitlistEnabled} hint="Each person gives explicit consent to be emailed about this drop." />
          </div>
          <div className="md:col-span-2">
            <Button testId="drop-save">Save</Button>
          </div>
        </form>
      </Card>

      <Card
        title={`Waitlist (${waitlist.length})`}
        description="People who asked to be told when this drop is available. One entry per address. Use it for that message only."
      >
        {waitlist.length === 0 ? (
          <Empty title="Nobody has joined yet" />
        ) : (
          <>
            {canExport && (
              <div className="mb-3">
                <LinkButton href={`/admin/drops/${drop.id}/waitlist`} external testId="waitlist-export">Export CSV</LinkButton>
              </div>
            )}
            <TableWrap label="Waitlist">
              <thead>
                <tr>
                  <th className={th}>Email</th>
                  <th className={th}>Joined</th>
                  <th className={th}>Consent given</th>
                </tr>
              </thead>
              <tbody>
                {waitlist.slice(0, 200).map((entry) => (
                  <tr key={entry.id}>
                    <td className={td}>{entry.email}</td>
                    <td className={td}>{formatDate(entry.joinedAt)}</td>
                    <td className={td}>{entry.consentText}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
            {waitlist.length > 200 && <p className="mt-2 text-xs text-neutral-600">Showing the latest 200. The export has all of them.</p>}
          </>
        )}
      </Card>

      {deletable && (
        <Card title="Delete" description="Only a draft or archived drop can be deleted. Waitlist entries are kept.">
          <form action={deleteDropAction} className="flex flex-wrap items-end gap-4">
            <input type="hidden" name="id" value={drop.id} />
            <ConfirmField word="DELETE" id="confirm-delete" />
            <Button variant="danger" testId="drop-delete">Delete drop</Button>
          </form>
        </Card>
      )}
    </>
  );
}
