/**
 * Order and delivery status, derived only from what Shopify recorded.
 *
 * The rule: a state is shown only when a provider status supports it. In
 * particular an order is never "Delivered" without a DELIVERED fulfilment event
 * from the carrier — "fulfilled" means it left the building, not that it arrived.
 */

export type FinancialStatus =
  | 'AUTHORIZED'
  | 'EXPIRED'
  | 'PAID'
  | 'PARTIALLY_PAID'
  | 'PARTIALLY_REFUNDED'
  | 'PENDING'
  | 'REFUNDED'
  | 'VOIDED';

export type ShipmentEventStatus =
  | 'ATTEMPTED_DELIVERY'
  | 'CARRIER_PICKED_UP'
  | 'CONFIRMED'
  | 'DELAYED'
  | 'DELIVERED'
  | 'FAILURE'
  | 'IN_TRANSIT'
  | 'LABEL_PRINTED'
  | 'LABEL_PURCHASED'
  | 'OUT_FOR_DELIVERY'
  | 'PICKED_UP'
  | 'READY_FOR_PICKUP';

export interface FulfillmentSnapshot {
  readonly status: string | null;
  readonly latestShipmentStatus: ShipmentEventStatus | string | null;
  readonly trackingNumbers: readonly string[];
}

export interface OrderSnapshot {
  readonly financialStatus: FinancialStatus | string | null;
  readonly fulfillmentStatus: string | null;
  readonly cancelledAt: string | null;
  readonly fulfillments: readonly FulfillmentSnapshot[];
}

/** The operator-facing state model requested in the brief. */
export type OrderState =
  | 'cancelled'
  | 'refunded'
  | 'partially_refunded'
  | 'pending_payment'
  | 'paid_unfulfilled'
  | 'partially_fulfilled'
  | 'fulfilled'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered'
  | 'delivery_issue'
  | 'unknown';

export const ORDER_STATE_LABELS: Record<OrderState, string> = {
  cancelled: 'Cancelled',
  refunded: 'Refunded',
  partially_refunded: 'Partially refunded',
  pending_payment: 'Pending payment',
  paid_unfulfilled: 'Paid — preparing your order',
  partially_fulfilled: 'Partially fulfilled',
  fulfilled: 'Fulfilled',
  shipped: 'Shipped',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  delivery_issue: 'Delivery issue',
  unknown: 'Status unavailable',
};

const SHIPPED_EVENTS = new Set(['CARRIER_PICKED_UP', 'IN_TRANSIT', 'CONFIRMED', 'LABEL_PURCHASED', 'LABEL_PRINTED', 'DELAYED']);

export function orderState(order: OrderSnapshot): OrderState {
  if (order.cancelledAt) return 'cancelled';
  const financial = order.financialStatus?.toUpperCase() ?? null;
  if (financial === 'REFUNDED') return 'refunded';
  if (financial === 'PENDING' || financial === 'AUTHORIZED' || financial === 'EXPIRED' || financial === 'VOIDED') {
    return 'pending_payment';
  }

  const events = order.fulfillments.map((f) => f.latestShipmentStatus?.toUpperCase() ?? null);
  const live = order.fulfillments.filter((f) => !['CANCELLED', 'ERROR', 'FAILURE'].includes(f.status?.toUpperCase() ?? ''));

  if (events.some((event) => event === 'FAILURE' || event === 'ATTEMPTED_DELIVERY')) return 'delivery_issue';
  if (live.length > 0 && events.length > 0 && events.every((event) => event === 'DELIVERED' || event === 'PICKED_UP')) {
    return 'delivered';
  }
  if (events.some((event) => event === 'OUT_FOR_DELIVERY' || event === 'READY_FOR_PICKUP')) return 'out_for_delivery';

  const fulfillment = order.fulfillmentStatus?.toUpperCase() ?? null;
  if (fulfillment === 'PARTIALLY_FULFILLED') return 'partially_fulfilled';
  if (fulfillment === 'FULFILLED') {
    if (events.some((event) => event && SHIPPED_EVENTS.has(event)) || live.some((f) => f.trackingNumbers.length > 0)) {
      return 'shipped';
    }
    return 'fulfilled';
  }
  if (financial === 'PARTIALLY_REFUNDED') return 'partially_refunded';
  if (financial === 'PAID' || financial === 'PARTIALLY_PAID') return 'paid_unfulfilled';
  return 'unknown';
}

export interface ProgressStep {
  readonly key: 'placed' | 'preparing' | 'shipped' | 'out_for_delivery' | 'delivered';
  readonly label: string;
  readonly state: 'complete' | 'current' | 'upcoming';
}

/** Delivery progress for the customer order page. Steps only complete on evidence. */
export function deliveryProgress(state: OrderState): ProgressStep[] | null {
  if (state === 'cancelled' || state === 'refunded' || state === 'unknown') return null;
  const order: ProgressStep['key'][] = ['placed', 'preparing', 'shipped', 'out_for_delivery', 'delivered'];
  const labels: Record<ProgressStep['key'], string> = {
    placed: 'Order placed',
    preparing: 'Preparing',
    shipped: 'Shipped',
    out_for_delivery: 'Out for delivery',
    delivered: 'Delivered',
  };
  const reached: Record<OrderState, number> = {
    pending_payment: 0,
    paid_unfulfilled: 1,
    partially_refunded: 1,
    partially_fulfilled: 1,
    fulfilled: 2,
    shipped: 2,
    delivery_issue: 3,
    out_for_delivery: 3,
    delivered: 4,
    cancelled: -1,
    refunded: -1,
    unknown: -1,
  };
  const current = reached[state];
  return order.map((key, index) => ({
    key,
    label: labels[key],
    state: index < current || (index === current && key === 'delivered') ? 'complete' : index === current ? 'current' : 'upcoming',
  }));
}

/** Readable labels for raw provider enums in the admin. */
export function humanise(value: string | null | undefined): string {
  if (!value) return '—';
  return value
    .toLowerCase()
    .split('_')
    .map((word, index) => (index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ');
}
