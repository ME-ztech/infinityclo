import { toCsv, csvResponse } from '@/server/admin/csv';
import { auditExport, exportStamp, guardExport } from '@/server/admin/export';
import { listSubscribers } from '@/server/records';

export const dynamic = 'force-dynamic';

/**
 * The newsletter list as CSV. Unsubscribed addresses are included and marked,
 * so whoever imports the file can suppress them rather than re-add them.
 */
export async function GET(): Promise<Response> {
  const guard = await guardExport('marketing.export', 'subscribers');
  if (guard.refused) return guard.refused;

  const subscribers = await listSubscribers();
  const body = toCsv(
    ['Email', 'Status', 'Subscribed (UTC)', 'Unsubscribed (UTC)', 'Source', 'Consent given'],
    subscribers.map((subscriber) => [
      subscriber.email,
      subscriber.status,
      subscriber.subscribedAt,
      subscriber.unsubscribedAt ?? '',
      subscriber.source,
      subscriber.consentText,
    ]),
  );
  await auditExport(guard.session, 'subscribers', subscribers.length);
  return csvResponse(`infnity-subscribers-${exportStamp()}.csv`, body);
}
