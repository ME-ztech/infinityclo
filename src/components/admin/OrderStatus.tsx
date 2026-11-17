import { PAYMENT_LABELS, fulfillmentLabel, type OrderStatus } from '@/server/admin/gateway';

import { Badge } from './ui';

const PAYMENT_TONE = {
  paid: 'good',
  partially_refunded: 'warn',
  refunded: 'neutral',
  pending_payment: 'warn',
  authorized: 'warn',
  partially_paid: 'warn',
  voided: 'neutral',
  expired: 'bad',
  unknown: 'neutral',
} as const;

const FULFILLMENT_TONE = {
  fulfilled: 'good',
  partially_fulfilled: 'warn',
  unfulfilled: 'warn',
  on_hold: 'bad',
  in_progress: 'warn',
  scheduled: 'neutral',
  unknown: 'neutral',
} as const;

/**
 * Order state exactly as the commerce backend reports it. There is no
 * "delivered" badge: order status alone does not establish delivery.
 */
export function OrderStatusBadges({ status, test }: { status: OrderStatus; test?: boolean }) {
  return (
    <span className="flex flex-wrap gap-1">
      {test && <Badge tone="solid" testId="order-test-badge">Test</Badge>}
      {status.cancelled && <Badge tone="bad">Cancelled</Badge>}
      <Badge tone={PAYMENT_TONE[status.payment]} testId="order-payment">{PAYMENT_LABELS[status.payment]}</Badge>
      <Badge tone={FULFILLMENT_TONE[status.fulfillment]} testId="order-fulfillment">{fulfillmentLabel(status)}</Badge>
    </span>
  );
}
