import Link from 'next/link';

import {
  AdminPage,
  Badge,
  DownloadLink,
  NotConnected,
  Table,
  Td,
  formatCad,
  formatDate,
} from '@/components/admin/ui';
import { humanise } from '@/domain/order-status';
import { can } from '@/domain/rbac';
import { requireStaffPage } from '@/server/auth/staff';
import { isAdminConfigured } from '@/server/shopify/config';
import { listCustomers } from '@/server/shopify/admin';

export const metadata = { title: 'Customers' };

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; after?: string }>;
}) {
  const session = await requireStaffPage('customers:read', '/admin/customers');
  const { q, after } = await searchParams;
  if (!isAdminConfigured()) {
    return (
      <AdminPage title="Customers" description="Customer records live in Shopify.">
        <NotConnected
          what="Customer search and profiles"
          envVar="SHOPIFY_ADMIN_ACCESS_TOKEN"
          scopes="read_customers, write_customers"
        />
      </AdminPage>
    );
  }
  const { customers, pageInfo } = await listCustomers(q ?? null, after ?? null);
  return (
    <AdminPage
      title="Customers"
      description="Live from Shopify. Payment card data is never available here."
      actions={
        can(session.user.role, 'customers:export') && (
          <DownloadLink href={`/admin/export/customers?${new URLSearchParams({ q: q ?? '' })}`}>
            Export CSV
          </DownloadLink>
        )
      }
    >
      <form className="flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Name, email or order number"
          className="border-line h-10 w-full max-w-sm border bg-white px-3 text-sm"
          aria-label="Search customers"
        />
        <button className="border-ink h-10 border px-4 text-xs font-semibold uppercase">
          Search
        </button>
      </form>
      <Table
        head={['Customer', 'Email', 'Marketing', 'Orders', 'Total spent', 'Last order', 'Tags']}
        empty={customers.length ? undefined : 'No customers match.'}
      >
        {customers.map((customer) => (
          <tr key={customer.id}>
            <Td>
              <Link
                href={`/admin/customers/${customer.id.split('/').pop()}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {customer.displayName}
              </Link>
            </Td>
            <Td>{customer.email ?? '—'}</Td>
            <Td>
              {customer.marketingState === 'SUBSCRIBED' ? (
                <Badge tone="good">Subscribed</Badge>
              ) : (
                <Badge>{humanise(customer.marketingState)}</Badge>
              )}
            </Td>
            <Td>{customer.numberOfOrders}</Td>
            <Td>
              {customer.amountSpent
                ? formatCad(customer.amountSpent.amount, customer.amountSpent.currencyCode)
                : '—'}
            </Td>
            <Td>{formatDate(customer.lastOrderAt)}</Td>
            <Td>{customer.tags.join(', ')}</Td>
          </tr>
        ))}
      </Table>
      {pageInfo.hasNextPage && (
        <Link
          href={`/admin/customers?${new URLSearchParams({ ...(q ? { q } : {}), after: pageInfo.endCursor ?? '' })}`}
          className="self-start text-sm underline"
        >
          Next page →
        </Link>
      )}
    </AdminPage>
  );
}
