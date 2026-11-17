import type { Metadata } from 'next';
import Link from 'next/link';

import { Badge, Button, Disconnected, Empty, Flash, LinkButton, PageHeader, TableWrap, formatDate, formatMoney, inputClass, td, th } from '@/components/admin/ui';
import { REQUIRED_ADMIN_SCOPES, getGateway, type AdminCustomerSummary } from '@/server/admin/gateway';
import { param, requirePage, type SearchParams } from '@/server/admin/page';
import { can } from '@/server/admin/permissions';

export const metadata: Metadata = { title: 'Customers' };

export default async function AdminCustomersPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requirePage('customers.view');
  const params = await searchParams;
  const gateway = await getGateway();
  const search = param(params, 'q');

  let customers: AdminCustomerSummary[] = [];
  let error: string | null = null;
  if (gateway) {
    try {
      customers = await gateway.listCustomers({ search });
    } catch (caught) {
      error = (caught as Error).message;
    }
  }

  return (
    <>
      <PageHeader
        title="Customers"
        description={
          gateway
            ? `Source: ${gateway.sourceLabel}. People who created an account. Guest orders appear under Orders. Card details are never stored here.`
            : undefined
        }
        actions={
          gateway && can(session.role, 'customers.export') ? (
            <LinkButton href={`/admin/customers/export${search ? `?q=${encodeURIComponent(search)}` : ''}`} external testId="customers-export">
              Export CSV
            </LinkButton>
          ) : undefined
        }
      />
      <Flash params={params} />
      {!gateway ? (
        <Disconnected module="Customers" scopes={REQUIRED_ADMIN_SCOPES} />
      ) : (
        <>
          <form method="get" role="search" aria-label="Search customers" className="mb-4 flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="q" className="mb-1 block text-xs font-semibold uppercase">Search</label>
              <input id="q" name="q" defaultValue={search} placeholder="Name, email or order number" className={`${inputClass} w-72`} />
            </div>
            <Button variant="secondary">Search</Button>
          </form>

          {error && <p role="alert" className="mb-4 border border-red-700 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</p>}

          {customers.length === 0 && !error ? (
            <Empty title={search ? 'No customers match' : 'No customers yet'}>
              {gateway.mode === 'sandbox'
                ? 'The sandbox holds no customers: personal data is never copied or invented.'
                : search
                  ? 'Try a different name, email address or order number.'
                  : 'Customers appear here when someone creates an account. Nothing is invented to fill the list.'}
            </Empty>
          ) : (
            <TableWrap label="Customers">
              <thead>
                <tr>
                  <th className={th}>Customer</th>
                  <th className={th}>Orders</th>
                  <th className={th}>Total spent</th>
                  <th className={th}>Last order</th>
                  <th className={th}>Marketing emails</th>
                  <th className={th}>Tags</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id} data-testid="customer-row">
                    <td className={td}>
                      <Link href={`/admin/customers/${customer.id}`} className="font-semibold underline underline-offset-4">
                        {customer.name}
                      </Link>
                      {customer.email && <span className="block text-xs text-neutral-600">{customer.email}</span>}
                    </td>
                    <td className={`${td} tabular-nums`}>{customer.ordersCount}</td>
                    <td className={`${td} tabular-nums`}>{formatMoney(customer.totalSpent)}</td>
                    <td className={td}>{formatDate(customer.lastOrderAt, false)}</td>
                    <td className={td}>
                      <Badge tone={customer.marketingState === 'subscribed' ? 'good' : 'neutral'}>{customer.marketingState}</Badge>
                    </td>
                    <td className={td}>{customer.tags.join(', ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
          <p className="mt-3 text-xs text-neutral-600">Showing up to 200 customers. Search to narrow the list.</p>
        </>
      )}
    </>
  );
}
