/**
 * Order progress, derived strictly from what Shopify reports.
 *
 * The rule: a step is shown as reached only when Shopify has said so. In
 * particular an order is "Delivered" only when a fulfillment carries a
 * DELIVERED shipment status or event — a fulfilled order with no carrier
 * confirmation stays at "Shipped", because that is all anyone actually knows.
 *
 * Pure functions, no I/O.
 */

export type FinancialStatus = 'AUTHORIZED' | 'EXPIRED' | 'PAID' | 'PARTIALLY_PAID' | 'PARTIALLY_REFUNDED' | 'PENDING' | 'REFUNDED' | 'VOIDED' | string;

export interface FulfillmentLike {
  readonly status: string | null;
  readonly latestShipmentStatus: string | null;
  readonly events: ReadonlyArray<{ readonly status: string; readonly happenedAt: string }>;
  readonly tracking: ReadonlyArray<{ readonly number: string | null; readonly company: string | null; readonly url: string | null }>;
}

export interface OrderLike {
  readonly cancelledAt: string | null;
  readonly financialStatus: FinancialStatus | null;
  readonly fulfillmentStatus: string | null;
  readonly fulfillments: readonly FulfillmentLike[];
}

export type ProgressStage =
  | 'cancelled'
  | 'awaiting_payment'
  | 'confirmed'
  | 'partially_shipped'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered'
  | 'attention';

export interface OrderProgress {
  readonly stage: ProgressStage;
  readonly label: string;
  readonly detail: string;
}

const FINANCIAL_LABELS: Record<string, string> = {
  AUTHORIZED: 'Payment authorised',
  EXPIRED: 'Payment expired',
  PAID: 'Paid',
  PARTIALLY_PAID: 'Partially paid',
  PARTIALLY_REFUNDED: 'Partially refunded',
  PENDING: 'Payment pending',
  REFUNDED: 'Refunded',
  VOIDED: 'Payment voided',
};

const FULFILLMENT_LABELS: Record<string, string> = {
  FULFILLED: 'Fulfilled',
  IN_PROGRESS: 'In progress',
  ON_HOLD: 'On hold',
  OPEN: 'Being prepared',
  PARTIALLY_FULFILLED: 'Partially fulfilled',
  PENDING_FULFILLMENT: 'Being prepared',
  RESTOCKED: 'Restocked',
  SCHEDULED: 'Scheduled',
  UNFULFILLED: 'Not yet shipped',
};

const sentenceCase = (value: string): string => {
  const text = value.replace(/_/g, ' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

export const financialLabel = (status: string | null): string =>
  status ? (FINANCIAL_LABELS[status] ?? sentenceCase(status)) : 'Unknown';

export const fulfillmentLabel = (status: string | null): string =>
  status ? (FULFILLMENT_LABELS[status] ?? sentenceCase(status)) : 'Unknown';

const SHIPMENT_LABELS: Record<string, string> = {
  ATTEMPTED_DELIVERY: 'Delivery attempted',
  CARRIER_PICKED_UP: 'Picked up by carrier',
  CONFIRMED: 'Confirmed',
  DELAYED: 'Delayed',
  DELIVERED: 'Delivered',
  FAILURE: 'Delivery problem',
  IN_TRANSIT: 'In transit',
  LABEL_PRINTED: 'Label printed',
  LABEL_PURCHASED: 'Label created',
  OUT_FOR_DELIVERY: 'Out for delivery',
  PICKED_UP: 'Picked up',
  READY_FOR_PICKUP: 'Ready for pickup',
};

export const shipmentLabel = (status: string | null): string | null =>
  status ? (SHIPMENT_LABELS[status] ?? sentenceCase(status)) : null;

/** A fulfillment that was cancelled or failed never counts as shipped. */
const isActive = (fulfillment: FulfillmentLike): boolean =>
  !['CANCELLED', 'ERROR', 'FAILURE'].includes(fulfillment.status ?? '');

const shipmentStatuses = (fulfillment: FulfillmentLike): string[] =>
  [fulfillment.latestShipmentStatus, ...fulfillment.events.map((event) => event.status)].filter(
    (status): status is string => Boolean(status),
  );

export const isDelivered = (fulfillment: FulfillmentLike): boolean =>
  isActive(fulfillment) &&
  (fulfillment.latestShipmentStatus === 'DELIVERED' ||
    (fulfillment.latestShipmentStatus === null && fulfillment.events.some((event) => event.status === 'DELIVERED')));

export function orderProgress(order: OrderLike): OrderProgress {
  if (order.cancelledAt) {
    return { stage: 'cancelled', label: 'Cancelled', detail: 'This order was cancelled.' };
  }

  const active = order.fulfillments.filter(isActive);

  if (active.length === 0) {
    if (order.financialStatus === 'PENDING') {
      return { stage: 'awaiting_payment', label: 'Awaiting payment', detail: 'Payment has not been confirmed yet.' };
    }
    return { stage: 'confirmed', label: 'Order received', detail: 'Your order has not shipped yet.' };
  }

  if (active.some((fulfillment) => shipmentStatuses(fulfillment).includes('FAILURE') && fulfillment.latestShipmentStatus === 'FAILURE')) {
    return { stage: 'attention', label: 'Delivery problem', detail: 'The carrier reported a problem with this shipment.' };
  }

  const fullyFulfilled = order.fulfillmentStatus === 'FULFILLED';

  if (fullyFulfilled && active.every(isDelivered)) {
    return { stage: 'delivered', label: 'Delivered', detail: 'The carrier has confirmed delivery.' };
  }
  if (active.some((fulfillment) => fulfillment.latestShipmentStatus === 'OUT_FOR_DELIVERY')) {
    return { stage: 'out_for_delivery', label: 'Out for delivery', detail: 'The carrier has your order out for delivery.' };
  }
  if (!fullyFulfilled) {
    return { stage: 'partially_shipped', label: 'Partially shipped', detail: 'Part of your order has shipped.' };
  }
  const hasTracking = active.some((fulfillment) => fulfillment.tracking.some((entry) => entry.number || entry.url));
  return {
    stage: 'shipped',
    label: 'Shipped',
    detail: hasTracking
      ? 'Your order has shipped. Use the tracking details below for the latest carrier update.'
      : 'Your order has shipped. No tracking number was provided for this shipment.',
  };
}

/** Only http(s) links are ever rendered as a tracking link. */
export function safeTrackingUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}
