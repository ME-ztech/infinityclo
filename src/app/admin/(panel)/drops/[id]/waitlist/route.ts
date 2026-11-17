import { toCsv, csvResponse } from '@/server/admin/csv';
import { auditExport, exportStamp, guardExport } from '@/server/admin/export';
import { getDrop, listWaitlist } from '@/server/records';

export const dynamic = 'force-dynamic';

/** A drop's waitlist as CSV, with the consent each person gave. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const guard = await guardExport('marketing.export', 'waitlist');
  if (guard.refused) return guard.refused;

  const { id } = await params;
  const drop = await getDrop(id);
  if (!drop) return new Response('Drop not found.', { status: 404 });

  const entries = await listWaitlist(drop.id);
  const body = toCsv(
    ['Email', 'Joined (UTC)', 'Consent given', 'Drop'],
    entries.map((entry) => [entry.email, entry.joinedAt, entry.consentText, drop.internalName]),
  );
  await auditExport(guard.session, 'waitlist', entries.length);
  return csvResponse(`infnity-waitlist-${drop.id}-${exportStamp()}.csv`, body);
}
