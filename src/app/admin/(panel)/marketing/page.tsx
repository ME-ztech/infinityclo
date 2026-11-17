import { desc } from 'drizzle-orm';

import { AdminPage, Badge, Card, DownloadLink, Table, Td, formatDate } from '@/components/admin/ui';
import { can } from '@/domain/rbac';
import { requireStaffPage } from '@/server/auth/staff';
import { getSettings } from '@/server/content/cms';
import { getDb } from '@/server/db/client';
import { outboundEmails } from '@/server/db/schema';
import { listDrops } from '@/server/drops';
import { isEmailConfigured } from '@/server/email';
import { listSubscribers } from '@/server/newsletter';
import { isAdminConfigured } from '@/server/shopify/config';

export const metadata = { title: 'Marketing' };

export default async function MarketingPage() {
  const session = await requireStaffPage('marketing:read', '/admin/marketing');
  const db = await getDb();
  const [subscribers, drops, emails, settings] = await Promise.all([
    listSubscribers(500),
    listDrops(),
    db.select().from(outboundEmails).orderBy(desc(outboundEmails.createdAt)).limit(50),
    getSettings(),
  ]);
  const subscribed = subscribers.filter((s) => s.status === 'subscribed').length;
  return (
    <AdminPage
      title="Marketing"
      description="Consent records for early-access email. Every subscriber ticked an unticked box; the exact wording, time and source are kept as evidence (CASL). Creating an account never subscribes anyone."
      actions={
        can(session.user.role, 'marketing:export') && (
          <DownloadLink href="/admin/export/subscribers">Export subscribers</DownloadLink>
        )
      }
    >
      <div className="grid gap-4 md:grid-cols-3">
        <Card title="Email provider">
          {isEmailConfigured() ? (
            <Badge tone="good">Resend connected</Badge>
          ) : (
            <Badge tone="warn">Not connected</Badge>
          )}
          <p className="mt-2 text-sm text-neutral-600">
            Sends only this app’s emails: double opt-in confirmations
            {settings.newsletterDoubleOptIn ? ' (on)' : ' (off)'}, staff notifications. Order and
            shipping emails are Shopify’s, so nothing is sent twice.
          </p>
        </Card>
        <Card title="Shopify consent sync">
          {isAdminConfigured() ? <Badge tone="good">On</Badge> : <Badge tone="warn">Off</Badge>}
          <p className="mt-2 text-sm text-neutral-600">
            Opt-ins and unsubscribes are mirrored onto the Shopify customer record (Shopify Email /
            Klaviyo can then use them). Unsubscribes made in Shopify flow back here by webhook.
          </p>
        </Card>
        <Card title="Abandoned checkout">
          <p className="text-sm text-neutral-600">
            Designated provider: <strong>Shopify</strong> (Marketing → Automations → Abandoned
            checkout). Checkout runs on Shopify, so Shopify knows who abandoned and their consent;
            this app sends no recovery emails, so customers never get duplicates.
          </p>
        </Card>
      </div>
      <Card title={`Subscribers (${subscribed} subscribed)`}>
        <Table
          head={['Email', 'Status', 'Source', 'Consent', 'Shopify sync']}
          empty={subscribers.length ? undefined : 'No sign-ups yet.'}
        >
          {subscribers.map((subscriber) => (
            <tr key={subscriber.id}>
              <Td>{subscriber.email}</Td>
              <Td>
                <Badge
                  tone={
                    subscriber.status === 'subscribed'
                      ? 'good'
                      : subscriber.status === 'pending'
                        ? 'warn'
                        : 'neutral'
                  }
                >
                  {subscriber.status}
                </Badge>
              </Td>
              <Td>{subscriber.source}</Td>
              <Td className="text-xs">
                {formatDate(subscriber.consentAt)} — “{subscriber.consentText}”
              </Td>
              <Td className="text-xs">{subscriber.shopifySyncStatus ?? '—'}</Td>
            </tr>
          ))}
        </Table>
      </Card>
      <Card title="Waitlists">
        <ul className="text-sm">
          {drops.map((drop) => (
            <li key={drop.id}>
              {drop.name}: {drop.waitlistCount} people ({drop.status})
            </li>
          ))}
          {drops.length === 0 && <li className="text-neutral-600">No drops yet.</li>}
        </ul>
      </Card>
      <Card title="App email log (last 50)">
        <Table
          head={['When', 'To', 'Template', 'Status']}
          empty={emails.length ? undefined : 'No app emails yet.'}
        >
          {emails.map((email) => (
            <tr key={email.id}>
              <Td>{formatDate(email.createdAt)}</Td>
              <Td>{email.to}</Td>
              <Td>{email.template}</Td>
              <Td>
                <Badge
                  tone={
                    email.status === 'sent' ? 'good' : email.status === 'failed' ? 'bad' : 'warn'
                  }
                >
                  {email.status.replace(/_/g, ' ')}
                </Badge>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
    </AdminPage>
  );
}
