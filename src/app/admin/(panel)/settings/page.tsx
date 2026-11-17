import { ActionForm } from '@/components/admin/ActionForm';
import { AdminPage, Badge, Card, Field, formatDate, inputClass, Table, Td } from '@/components/admin/ui';
import { can, ROLE_LABELS, ROLES } from '@/domain/rbac';
import { recentAudit } from '@/server/audit';
import { listStaff, requireStaffPage } from '@/server/auth/staff';
import { getSettings } from '@/server/content/cms';
import { databaseKind } from '@/server/db/client';
import { isEmailConfigured } from '@/server/email';
import { isAppSecretConfigured } from '@/server/security/crypto';
import { checkoutMode, integrationStatuses, SHOPIFY_API_VERSION, shopifyConfig } from '@/server/shopify/config';

import { createStaffAction, saveSettingsAction, updateStaffAction } from './actions';

export const metadata = { title: 'Settings & staff' };

export default async function SettingsPage() {
  const session = await requireStaffPage('settings:read', '/admin/settings');
  const role = session.user.role;
  const [settings, staff, auditEntries] = await Promise.all([
    getSettings(),
    can(role, 'staff:manage') ? listStaff() : Promise.resolve([]),
    can(role, 'audit:read') ? recentAudit(100) : Promise.resolve([]),
  ]);
  const canWrite = can(role, 'settings:write');
  const health = [
    { label: 'Database', ok: databaseKind() === 'postgres', detail: databaseKind() === 'postgres' ? 'PostgreSQL (durable)' : `${databaseKind()} — not durable; set DATABASE_URL` },
    { label: 'Session secret', ok: isAppSecretConfigured(), detail: isAppSecretConfigured() ? 'APP_SECRET set' : 'APP_SECRET missing — required in production' },
    { label: 'Checkout hand-off', ok: checkoutMode() !== 'disabled', detail: `Mode: ${checkoutMode()}` },
    { label: 'App email', ok: isEmailConfigured(), detail: isEmailConfigured() ? 'Resend' : 'RESEND_API_KEY / EMAIL_FROM not set' },
  ];
  return (
    <AdminPage title="Settings & staff" description={`Store ${shopifyConfig().storeDomain} · Shopify API ${SHOPIFY_API_VERSION} · currency CAD`}>
      <Card title="Store details & switches">
        <ActionForm action={saveSettingsAction} submitLabel="Save settings" testId="settings-form">
          <fieldset disabled={!canWrite} className="grid gap-3 md:grid-cols-3">
            <Field label="Brand name (display)"><input name="brandName" defaultValue={settings.brandName} className={inputClass} /></Field>
            <Field label="Trade name"><input name="tradeName" defaultValue={settings.tradeName} className={inputClass} /></Field>
            <Field label="Public email"><input name="publicEmail" type="email" defaultValue={settings.publicEmail} className={inputClass} /></Field>
            <Field label="Public phone"><input name="publicPhone" defaultValue={settings.publicPhone} className={inputClass} /></Field>
            <Field label="Staff notification email (private)"><input name="notificationEmail" type="email" defaultValue={settings.notificationEmail} className={inputClass} /></Field>
            <Field label="Low-stock threshold"><input name="lowStockThreshold" type="number" min={0} defaultValue={settings.lowStockThreshold} className={inputClass} /></Field>
            <Field label="Instagram handle"><input name="instagramHandle" defaultValue={settings.instagramHandle} className={inputClass} /></Field>
            <Field label="Threads handle"><input name="threadsHandle" defaultValue={settings.threadsHandle} className={inputClass} /></Field>
            <Field label="Facebook page URL (verify before adding)"><input name="facebookUrl" defaultValue={settings.facebookUrl} className={inputClass} /></Field>
            <div className="flex flex-col gap-2 text-sm md:col-span-3">
              <label className="flex items-center gap-2"><input type="checkbox" name="cartUpsellEnabled" defaultChecked={settings.cartUpsellEnabled} /> “You may also like” inside the cart (your follow-up notes asked “cart: no upsells?” — off until you decide)</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="pdpRecommendationsEnabled" defaultChecked={settings.pdpRecommendationsEnabled} /> “You may also like” under product pages</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="newsletterDoubleOptIn" defaultChecked={settings.newsletterDoubleOptIn} /> Double opt-in for newsletter (needs an email provider)</label>
            </div>
          </fieldset>
        </ActionForm>
      </Card>

      <div id="integrations" className="grid gap-4 md:grid-cols-2">
        <Card title="Integrations (Shopify)">
          <ul className="flex flex-col gap-4 text-sm">
            {integrationStatuses().map((status) => (
              <li key={status.key}>
                <p className="flex items-center gap-2 font-semibold">{status.label} {status.configured ? <Badge tone="good">Connected</Badge> : <Badge tone="warn">Not connected</Badge>}</p>
                <p className="text-neutral-600">{status.unlocks}</p>
                {!status.configured && (
                  <p className="mt-1 text-xs text-neutral-500">
                    Env: {status.envVars.join(', ')}. {status.setup}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Health (values are never shown)">
          <ul className="flex flex-col gap-2 text-sm">
            {health.map((item) => (
              <li key={item.label} className="flex items-center justify-between gap-3">
                <span>{item.label}</span>
                <span className="text-right">{item.ok ? <Badge tone="good">OK</Badge> : <Badge tone="warn">Action needed</Badge>} <span className="block text-xs text-neutral-500">{item.detail}</span></span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {can(role, 'staff:manage') && (
        <Card title="Staff">
          <Table head={['Name', 'Email', 'Role', 'Status', 'Last sign-in', 'Actions']}>
            {staff.map((member) => (
              <tr key={member.id}>
                <Td>{member.name}</Td>
                <Td>{member.email}</Td>
                <Td>
                  <ActionForm action={updateStaffAction} inline submitLabel="Set" variant="secondary">
                    <input type="hidden" name="id" value={member.id} />
                    <input type="hidden" name="intent" value="role" />
                    <select name="role" defaultValue={member.role} className="border-line h-9 border px-1 text-sm" aria-label={`Role for ${member.email}`} disabled={member.id === session.user.id}>
                      {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                  </ActionForm>
                </Td>
                <Td>{member.active ? <Badge tone="good">Active</Badge> : <Badge>Deactivated</Badge>} {member.lockedUntil && member.lockedUntil > new Date() && <Badge tone="bad">Locked</Badge>}</Td>
                <Td>{formatDate(member.lastLoginAt)}</Td>
                <Td>
                  {member.id !== session.user.id && (
                    <ActionForm action={updateStaffAction} inline submitLabel={member.active ? 'Deactivate' : 'Activate'} variant={member.active ? 'danger' : 'secondary'} confirm={member.active ? `Deactivate ${member.email}? They are signed out immediately.` : undefined}>
                      <input type="hidden" name="id" value={member.id} />
                      <input type="hidden" name="intent" value={member.active ? 'deactivate' : 'activate'} />
                    </ActionForm>
                  )}
                  <ActionForm action={updateStaffAction} inline submitLabel="Reset password" variant="secondary">
                    <input type="hidden" name="id" value={member.id} />
                    <input type="hidden" name="intent" value="password" />
                    <input name="password" type="password" minLength={12} placeholder="New password (12+)" className="border-line h-9 border px-2 text-sm" aria-label={`New password for ${member.email}`} autoComplete="new-password" />
                  </ActionForm>
                </Td>
              </tr>
            ))}
          </Table>
          <div className="mt-6">
            <h3 className="mb-2 text-sm font-semibold">Add staff</h3>
            <ActionForm action={createStaffAction} submitLabel="Create account" testId="create-staff">
              <div className="grid gap-2 md:grid-cols-4">
                <input name="name" placeholder="Name" className={inputClass} aria-label="Name" required />
                <input name="email" type="email" placeholder="Email" className={inputClass} aria-label="Email" required />
                <select name="role" defaultValue="support" className={inputClass} aria-label="Role">
                  {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
                <input name="password" type="password" placeholder="Temporary password (12+ chars, a number)" className={inputClass} aria-label="Temporary password" autoComplete="new-password" required />
              </div>
            </ActionForm>
          </div>
        </Card>
      )}

      {can(role, 'audit:read') && (
        <Card title="Audit log (latest 100)">
          <Table head={['When', 'Who', 'Action', 'Summary']}>
            {auditEntries.map((entry) => (
              <tr key={entry.id}>
                <Td className="whitespace-nowrap">{formatDate(entry.at)}</Td>
                <Td>{entry.actorEmail ?? 'system'}</Td>
                <Td><code className="text-xs">{entry.action}</code></Td>
                <Td>{entry.summary}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </AdminPage>
  );
}
