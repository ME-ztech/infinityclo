import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { updateCustomerAction } from '@/app/admin/actions/commerce';
import { OrderStatusBadges } from '@/components/admin/OrderStatus';
import { Badge, Button, Card, Disconnected, Flash, LinkButton, PageHeader, Stat, TableWrap, TextArea, TextField, formatDate, formatMoney, td, th } from '@/components/admin/ui';
import { REQUIRED_ADMIN_SCOPES, getGateway } from '@/server/admin/gateway';
import { requirePage, type SearchParams } from '@/server/admin/page';
import { can } from '@/server/admin/permissions';

export const metadata: Metadata = { title: 'Customer' };

export default async function AdminCustomerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const session = await requirePage('customers.view');
  const { id } = await params;
  const query = await searchParams;
  const gateway = await getGateway();

  if (!gateway) {
    return (
      <>
        <PageHeader title="Customer" actions={<LinkButton href="/admin/customers">Back to customers</LinkButton>} />
        <Disconnected module="Customers" scopes={REQUIRED_ADMIN_SCOPES} />
      </>
    );
  }

  const customer = await gateway.getCustomer(id);
  if (!customer) notFound();
  const canEdit = can(session.role, 'customers.edit');
  const seesOrders = can(session.role, 'orders.view');

  return (
    <>
      <PageHeader
        title={customer.name}
        description={`Customer since ${formatDate(customer.createdAt, false)} · Source: ${gateway.sourceLabel}`}
        actions={<LinkButton href="/admin/customers">Back to customers</LinkButton>}
      />
      <Flash params={query} />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Orders" value={customer.ordersCount} note="Not counting cancelled orders." />
        <Stat label="Total spent" value={formatMoney(customer.totalSpent)} note="Order totals less refunds." />
        <Stat label="Last order" value={formatDate(customer.lastOrderAt, false)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <div className="min-w-0">
          <Card title="Contact">
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs font-semibold text-neutral-600 uppercase">Email</dt>
                <dd>{customer.email ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-neutral-600 uppercase">Phone</dt>
                <dd>{customer.phone ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-neutral-600 uppercase">Location</dt>
                <dd>{customer.location ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-neutral-600 uppercase">Marketing emails</dt>
                <dd>
                  <Badge tone={customer.marketingState === 'subscribed' ? 'good' : 'neutral'} testId="customer-consent">
                    {customer.marketingState}
                  </Badge>
                  <p className="mt-1 text-xs leading-relaxed text-neutral-600">
                    Set by the customer, from their account or a signup form. Staff cannot opt a customer in; to opt someone
                    out, use Marketing → Unsubscribe.
                  </p>
                </dd>
              </div>
            </dl>
          </Card>

          <Card title="Note and tags" description="Staff only. Never shown to the customer.">
            {canEdit ? (
              <form action={updateCustomerAction} className="space-y-3" data-testid="customer-form">
                <input type="hidden" name="id" value={customer.id} />
                <TextArea label="Note" name="note" defaultValue={customer.note} maxLength={5000} rows={4} />
                <TextField label="Tags" name="tags" defaultValue={customer.tags.join(', ')} maxLength={1000} hint="Comma-separated, for example: wholesale, early-access." />
                <Button variant="secondary" testId="customer-save">Save</Button>
              </form>
            ) : (
              <>
                <p className="text-sm whitespace-pre-wrap">{customer.note || 'No note.'}</p>
                <p className="mt-2 text-sm text-neutral-700">Tags: {customer.tags.join(', ') || '—'}</p>
              </>
            )}
          </Card>
        </div>

        <div className="min-w-0">
          <Card title="Orders">
            {!seesOrders ? (
              <p className="text-sm text-neutral-600">Your role does not include order details.</p>
            ) : customer.orders.length === 0 ? (
              <p className="text-sm text-neutral-600">No orders on this account.</p>
            ) : (
              <TableWrap label="Customer orders">
                <thead>
                  <tr>
                    <th className={th}>Order</th>
                    <th className={th}>Placed</th>
                    <th className={th}>Status</th>
                    <th className={th}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {customer.orders.map((order) => (
                    <tr key={order.id}>
                      <td className={td}>
                        <Link href={`/admin/orders/${order.id}`} className="font-semibold underline underline-offset-4">
                          {order.name}
                        </Link>
                      </td>
                      <td className={td}>{formatDate(order.createdAt)}</td>
                      <td className={td}><OrderStatusBadges status={order.status} test={order.test} /></td>
                      <td className={`${td} tabular-nums`}>{formatMoney(order.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
