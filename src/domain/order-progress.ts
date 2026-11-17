/**
 * Order progress, as shown to the customer.
 *
 * A step is reached only when the order's own records say so. In particular
 * "Delivered" requires a recorded delivery on every shipment — an order that
 * has shipped but has no delivery record stays at "Shipped", because that is
 * all anyone actually knows.
 */
export type ProgressStep = 'placed' | 'paid' | 'shipped' | 'delivered';

export interface OrderProgressInput {
  readonly paymentStatus: 'pending_payment' | 'paid' | 'partially_refunded' | 'refunded';
  readonly fulfillmentStatus: 'unfulfilled' | 'partially_fulfilled' | 'fulfilled';
  readonly cancelled: boolean;
  readonly shipments: ReadonlyArray<{ deliveredAt: Date | string | null }>;
}

export interface OrderProgress {
  /** Human summary, e.g. "Shipped" or "Cancelled — refunded". */
  readonly label: string;
  readonly cancelled: boolean;
  readonly steps: ReadonlyArray<{ id: ProgressStep; label: string; reached: boolean }>;
}

export function orderProgress(input: OrderProgressInput): OrderProgress {
  const paid = input.paymentStatus !== 'pending_payment';
  const shippedAny = input.shipments.length > 0;
  const shippedAll = input.fulfillmentStatus === 'fulfilled';
  const delivered = shippedAll && input.shipments.length > 0 && input.shipments.every((shipment) => shipment.deliveredAt);

  const steps = [
    { id: 'placed' as const, label: 'Order placed', reached: true },
    { id: 'paid' as const, label: 'Payment received', reached: paid },
    { id: 'shipped' as const, label: shippedAny && !shippedAll ? 'Partly shipped' : 'Shipped', reached: shippedAny },
    { id: 'delivered' as const, label: 'Delivered', reached: Boolean(delivered) },
  ];

  let label: string;
  if (input.cancelled) {
    label = input.paymentStatus === 'refunded' ? 'Cancelled — refunded' : 'Cancelled';
  } else if (delivered) {
    label = 'Delivered';
  } else if (shippedAll) {
    label = 'Shipped';
  } else if (shippedAny) {
    label = 'Partly shipped';
  } else if (input.paymentStatus === 'refunded') {
    label = 'Refunded';
  } else if (paid) {
    label = 'Preparing your order';
  } else {
    label = 'Awaiting payment';
  }
  if (!input.cancelled && input.paymentStatus === 'partially_refunded') label += ' — partly refunded';

  return { label, cancelled: input.cancelled, steps };
}
