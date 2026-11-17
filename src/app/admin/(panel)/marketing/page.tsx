import type { Metadata } from 'next';

import { unsubscribeAction } from '@/app/admin/actions/local';
import { Badge, Button, Card, Empty, Flash, LinkButton, PageHeader, Stat, TableWrap, formatDate, td, th } from '@/components/admin/ui';
import { defaultRange } from '@/server/admin/metrics';
import { requirePage, type SearchParams } from '@/server/admin/page';
import { can } from '@/server/admin/permissions';
import { config } from '@/server/config';
import { listDrops, listSubscribers, listWaitlist } from '@/server/records';

export const metadata: Metadata = { title: 'Marketing' };

export default async function AdminMarketingPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requirePage('marketing.view');
  const params = await searchParams;
  const [subscribers, waitlist, drops] = await Promise.all([listSubscribers(), listWaitlist(), listDrops()]);
  const active = subscribers.filter((subscriber) => subscriber.status === 'subscribed');
  const since = `${defaultRange(30).from}T00:00:00.000Z`;
  const recent = active.filter((subscriber) => subscriber.subscribedAt >= since).length;
  const canExport = can(session.role, 'marketing.export');
  const sources = new Map<string, number>();
  for (const subscriber of active) sources.set(subscriber.source, (sources.get(subscriber.source) ?? 0) + 1);

  return (
    <>
      <PageHeader
        title="Marketing"
        description="The email list, with the consent each person gave. Marketing consent is its own explicit choice — it is never assumed from an account or an order."
        actions={canExport ? <LinkButton href="/admin/marketing/export" external testId="subscribers-export">Export CSV</LinkButton> : undefined}
      />
      <Flash params={params} />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Subscribed" value={active.length} testId="stat-subscribed" />
        <Stat label="New in 30 days" value={recent} />
        <Stat label="Unsubscribed" value={subscribers.length - active.length} note="Kept as proof of the change." />
        <Stat label="Waitlist entries" value={waitlist.length} note={`Across ${drops.length} drop${drops.length === 1 ? '' : 's'}. Managed under Drops.`} />
      </div>

      <Card title="What is sent, and by what" description="Stated plainly so nobody assumes more is happening than is.">
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-neutral-800">
          <li>
            <strong>There is no bulk-send here.</strong> This screen cannot email the list. To send a campaign, export the
            subscribed addresses into your email tool; every export is recorded in the audit log.
          </li>
          <li>
            <strong>Checkout reminders</strong> are sent by the scheduled maintenance job (
            <code className="font-mono">/api/cron/maintenance</code>) only to people who ticked “email me a reminder” at
            checkout, at most once per abandoned checkout, and only when an email provider is connected.
          </li>
          <li>
            <strong>Order and account emails</strong> (confirmation, shipping, verification, password reset) are service
            messages. They do not depend on marketing consent and are not sent from this screen.
          </li>
          <li>
            Email provider:{' '}
            <Badge tone={config.email.configured ? 'good' : 'warn'}>{config.email.configured ? 'Connected' : 'Not connected — nothing is being emailed'}</Badge>
          </li>
        </ul>
      </Card>

      {sources.size > 0 && (
        <Card title="Where subscribers signed up">
          <ul className="flex flex-wrap gap-2 text-sm">
            {[...sources.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([source, count]) => (
                <li key={source} className="border border-neutral-200 px-3 py-1">
                  {source}: <strong className="tabular-nums">{count}</strong>
                </li>
              ))}
          </ul>
        </Card>
      )}

      {subscribers.length === 0 ? (
        <Empty title="No subscribers yet">Signups from the newsletter form appear here, with the wording each person agreed to.</Empty>
      ) : (
        <>
          <TableWrap label="Subscribers">
            <thead>
              <tr>
                <th className={th}>Email</th>
                <th className={th}>Status</th>
                <th className={th}>Signed up</th>
                <th className={th}>Where</th>
                <th className={th}>Consent given</th>
                <th className={th}>Action</th>
              </tr>
            </thead>
            <tbody>
              {subscribers.slice(0, 300).map((subscriber) => (
                <tr key={subscriber.id} data-testid="subscriber-row">
                  <td className={td}>{subscriber.email}</td>
                  <td className={td}>
                    <Badge tone={subscriber.status === 'subscribed' ? 'good' : 'neutral'}>{subscriber.status}</Badge>
                    {subscriber.unsubscribedAt && <span className="block text-xs text-neutral-600">{formatDate(subscriber.unsubscribedAt)}</span>}
                  </td>
                  <td className={td}>{formatDate(subscriber.subscribedAt)}</td>
                  <td className={td}>{subscriber.source}</td>
                  <td className={`${td} max-w-xs text-xs leading-relaxed`}>{subscriber.consentText}</td>
                  <td className={td}>
                    {subscriber.status === 'subscribed' && canExport ? (
                      <form action={unsubscribeAction}>
                        <input type="hidden" name="email" value={subscriber.email} />
                        <Button variant="secondary" testId="subscriber-unsubscribe" aria-label={`Unsubscribe ${subscriber.email}`}>Unsubscribe</Button>
                      </form>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          {subscribers.length > 300 && <p className="mt-2 text-xs text-neutral-600">Showing the latest 300. The export has all of them.</p>}
        </>
      )}
    </>
  );
}
