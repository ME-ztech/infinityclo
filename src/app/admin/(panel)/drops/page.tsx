import { ActionForm } from '@/components/admin/ActionForm';
import { ImageUrlInput } from '@/components/admin/ImageUrlInput';
import {
  AdminPage,
  Badge,
  Card,
  DownloadLink,
  Field,
  formatDate,
  inputClass,
  textareaClass,
} from '@/components/admin/ui';
import { can } from '@/domain/rbac';
import { requireStaffPage } from '@/server/auth/staff';
import { DROP_STATUSES, listDrops } from '@/server/drops';

import { saveDropAction } from './actions';

export const metadata = { title: 'Drops & waitlists' };

const toLocal = (date: Date | null) =>
  date ? new Date(date.getTime() - 6 * 3600_000).toISOString().slice(0, 16) : '';

function DropFields({ drop }: { drop?: Awaited<ReturnType<typeof listDrops>>[number] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {drop && <input type="hidden" name="id" value={drop.id} />}
      <Field label="Name (internal and fallback headline)">
        <input name="name" defaultValue={drop?.name} className={inputClass} required />
      </Field>
      <Field label="URL slug">
        <input
          name="slug"
          defaultValue={drop?.slug}
          className={inputClass}
          placeholder="next-drop"
          required
        />
      </Field>
      <Field label="Stage">
        <select name="status" defaultValue={drop?.status ?? 'draft'} className={inputClass}>
          {DROP_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status.replace('_', ' ')}
              {status === 'coming_soon' || status === 'early_access' ? ' (shown on site)' : ''}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Linked Shopify product handle (when it exists)">
        <input
          name="shopifyProductHandle"
          defaultValue={drop?.shopifyProductHandle ?? ''}
          className={inputClass}
        />
      </Field>
      <Field label="Teaser headline">
        <input name="headline" defaultValue={drop?.headline ?? ''} className={inputClass} />
      </Field>
      <Field label="Teaser copy (only confirmed details)">
        <textarea name="body" defaultValue={drop?.body ?? ''} rows={3} className={textareaClass} />
      </Field>
      <Field label="Teaser image">
        <ImageUrlInput name="mediaUrl" defaultValue={drop?.mediaUrl ?? ''} label="Teaser image" />
      </Field>
      <Field label="Image description">
        <input name="mediaAlt" defaultValue={drop?.mediaAlt ?? ''} className={inputClass} />
      </Field>
      <Field label="Release date & time (Central)">
        <input
          name="releaseAt"
          type="datetime-local"
          defaultValue={toLocal(drop?.releaseAt ?? null)}
          className={inputClass}
        />
      </Field>
      <div className="flex flex-col justify-end gap-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="releaseConfirmed" defaultChecked={drop?.releaseConfirmed} />{' '}
          Release time is confirmed (shows a countdown)
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="waitlistEnabled"
            defaultChecked={drop?.waitlistEnabled ?? true}
          />{' '}
          Waitlist open
        </label>
      </div>
    </div>
  );
}

export default async function DropsPage() {
  const session = await requireStaffPage('drops:write', '/admin/drops');
  const drops = await listDrops();
  return (
    <AdminPage
      title="Drops & waitlists"
      description="Lifecycle: draft → coming soon → early access → published → sold out → archived. Only “coming soon” and “early access” appear on the storefront. Never publish a name, price, spec or date that isn’t confirmed."
      actions={
        can(session.user.role, 'marketing:export') && (
          <DownloadLink href="/admin/export/waitlist">Export waitlists</DownloadLink>
        )
      }
    >
      {drops.map((drop) => (
        <Card
          key={drop.id}
          title={drop.name}
          actions={
            <span className="flex items-center gap-2">
              <Badge
                tone={
                  drop.status === 'coming_soon' || drop.status === 'early_access'
                    ? 'good'
                    : 'neutral'
                }
              >
                {drop.status}
              </Badge>{' '}
              <span className="text-sm">{drop.waitlistCount} on waitlist</span>
            </span>
          }
        >
          <ActionForm action={saveDropAction} submitLabel="Save drop">
            <DropFields drop={drop} />
          </ActionForm>
          <p className="mt-2 text-xs text-neutral-500">Updated {formatDate(drop.updatedAt)}</p>
        </Card>
      ))}
      <Card title="New drop">
        <ActionForm action={saveDropAction} submitLabel="Create drop" testId="new-drop">
          <DropFields />
        </ActionForm>
      </Card>
    </AdminPage>
  );
}
