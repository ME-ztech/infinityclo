import { toCsv, csvResponse } from '@/server/admin/csv';
import { auditExport, exportStamp, guardExport } from '@/server/admin/export';
import { getGateway } from '@/server/admin/gateway';

export const dynamic = 'force-dynamic';

/** Customers as CSV. Contains personal data: Owner-only, and audited. */
export async function GET(request: Request): Promise<Response> {
  const guard = await guardExport('customers.export', 'customers');
  if (guard.refused) return guard.refused;

  const gateway = await getGateway();
  if (!gateway) return new Response('The commerce database is not configured.', { status: 503 });

  const search = (new URL(request.url).searchParams.get('q') ?? '').slice(0, 200);
  const customers = await gateway.listCustomers({ search });
  const body = toCsv(
    ['Name', 'Email', 'Orders', 'Total spent', 'Currency', 'Last order (UTC)', 'Marketing emails', 'Tags', 'Created (UTC)'],
    customers.map((customer) => [
      customer.name,
      customer.email ?? '',
      customer.ordersCount,
      customer.totalSpent ? (customer.totalSpent.amount / 100).toFixed(2) : '',
      customer.totalSpent?.currency ?? '',
      customer.lastOrderAt ?? '',
      customer.marketingState,
      customer.tags.join('; '),
      customer.createdAt,
    ]),
  );
  await auditExport(guard.session, 'customers', customers.length, true);
  return csvResponse(`infnity-customers-${exportStamp()}.csv`, body);
}
