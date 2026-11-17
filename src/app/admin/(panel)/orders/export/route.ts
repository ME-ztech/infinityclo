import { toCsv, csvResponse } from '@/server/admin/csv';
import { auditExport, exportStamp, guardExport } from '@/server/admin/export';
import { FULFILLMENT_LABELS, PAYMENT_LABELS, getGateway, type OrderQuery } from '@/server/admin/gateway';

export const dynamic = 'force-dynamic';

const PAYMENTS = ['paid', 'pending', 'refunded', 'partially_refunded'];
const FULFILLMENTS = ['unfulfilled', 'partial', 'fulfilled'];
const isDate = (value: string | null): value is string => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));

/** The orders currently listed, as CSV. Same filters as the Orders screen. */
export async function GET(request: Request): Promise<Response> {
  const guard = await guardExport('orders.export', 'orders');
  if (guard.refused) return guard.refused;

  const gateway = await getGateway();
  if (!gateway) return new Response('The commerce database is not configured.', { status: 503 });

  const params = new URL(request.url).searchParams;
  const payment = params.get('payment') ?? '';
  const fulfillment = params.get('fulfillment') ?? '';
  const query: OrderQuery = {
    search: (params.get('q') ?? '').slice(0, 200),
    payment: PAYMENTS.includes(payment) ? (payment as OrderQuery['payment']) : '',
    fulfillment: FULFILLMENTS.includes(fulfillment) ? (fulfillment as OrderQuery['fulfillment']) : '',
    from: isDate(params.get('from')) ? params.get('from')! : undefined,
    to: isDate(params.get('to')) ? params.get('to')! : undefined,
    limit: 500,
  };

  const orders = await gateway.listOrders(query);
  const body = toCsv(
    ['Order', 'Placed (UTC)', 'Customer', 'Email', 'Payment', 'Fulfilment', 'Cancelled', 'Test', 'Items', 'Total', 'Currency'],
    orders.map((order) => [
      order.name,
      order.createdAt,
      order.customerName ?? '',
      order.email ?? '',
      PAYMENT_LABELS[order.status.payment],
      FULFILLMENT_LABELS[order.status.fulfillment],
      order.status.cancelled ? 'yes' : 'no',
      order.test ? 'yes' : 'no',
      order.itemCount,
      (order.total.amount / 100).toFixed(2),
      order.total.currency,
    ]),
  );
  await auditExport(guard.session, 'orders', orders.length, true);
  return csvResponse(`infnity-orders-${exportStamp()}.csv`, body);
}
