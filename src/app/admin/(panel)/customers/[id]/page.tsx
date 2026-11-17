import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ActionForm } from '@/components/admin/ActionForm';
import { AdminPage, Badge, Card, formatCad, formatDate, NotConnected, Table, Td } from '@/components/admin/ui';
import { humanise } from '@/domain/order-status';
import { can } from '@/domain/rbac';
import { requireStaffPage } from '@/server/auth/staff';
import { isAdminConfigured } from '@/server/shopify/config';
import { getCustomer } from '@/server/shopify/admin';

import { updateCustomerAction } from '../actions';

export const metadata = { title: 'Customer' };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireStaffPage('customers:read', `/admin/customers/${id}`);
  if (!/^\d+$/.test(id)) notFound();
  if (!isAdminConfigured()) {
    return (
      <AdminPage title="Customer">
        <NotConnected what="Customer profiles" envVar="SHOPIFY_ADMIN_ACCESS_TOKEN" scopes="read_customers" />
      </AdminPage>
    );
  }
  const customer = await getCustomer(id);
  if (!customer) notFound();
  return (
    <AdminPage title={customer.displayName} description={`Customer since ${formatDate(customer.createdAt)}`}>
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card title={`Orders (${customer.numberOfOrders})`}>
          <Table head={['Order', 'Date', 'Payment', 'Fulfilment', 'Total']}>
            {customer.orders.nodes.map((order) => (
              <tr key={order.id}>
                <Td>
                  <Link href={`/admin/orders/${order.id.split('/').pop()}`} className="underline">{order.name}</Link>
                </Td>
                <Td>{formatDate(order.processedAt)}</Td>
                <Td>{humanise(order.displayFinancialStatus)}</Td>
                <Td>{humanise(order.displayFulfillmentStatus)}</Td>
                <Td>{formatCad(order.totalPriceSet.shopMoney.amount, order.totalPriceSet.shopMoney.currencyCode)}</Td>
              </tr>
            ))}
          </Table>
        </Card>
        <div className="flex flex-col gap-6">
          <Card title="Contact">
            <p className="text-sm">{customer.defaultEmailAddress?.emailAddress ?? 'No email'}</p>
            {customer.defaultPhoneNumber && <p className="text-sm">{customer.defaultPhoneNumber.phoneNumber}</p>}
            <p className="mt-2 text-sm">
              Email marketing:{' '}
              {customer.defaultEmailAddress?.marketingState === 'SUBSCRIBED' ? <Badge tone="good">Subscribed</Badge> : <Badge>{humanise(customer.defaultEmailAddress?.marketingState)}</Badge>}
            </p>
            {customer.defaultEmailAddress?.marketingUpdatedAt && <p className="text-xs text-neutral-500">Consent updated {formatDate(customer.defaultEmailAddress.marketingUpdatedAt)}</p>}
            <p className="mt-2 text-sm">Total spent: {customer.amountSpent ? formatCad(customer.amountSpent.amount, customer.amountSpent.currencyCode) : '—'}</p>
            {customer.defaultAddress && (
              <address className="mt-3 text-sm text-neutral-700 not-italic">
                {customer.defaultAddress.formatted.map((line) => (
                  <span key={line} className="block">{line}</span>
                ))}
              </address>
            )}
          </Card>
          {can(session.user.role, 'customers:write') && (
            <Card title="Notes & tags">
              <ActionForm action={updateCustomerAction} submitLabel="Save">
                <input type="hidden" name="id" value={id} />
                <textarea name="note" defaultValue={customer.note ?? ''} rows={4} className="border-line border p-2 text-sm" aria-label="Note" />
                <input name="tags" defaultValue={customer.tags.join(', ')} className="border-line h-10 border px-3 text-sm" aria-label="Tags" />
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </AdminPage>
  );
}
