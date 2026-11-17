/**
 * Commerce gateway — the back office's only door to commerce data.
 *
 * Shopify is the system of record. The dashboard never keeps its own copy of
 * products, stock, orders or customers; it asks the gateway. Two
 * implementations satisfy this interface:
 *
 *   ShopifyAdminGateway   the real store, through the GraphQL Admin API.
 *   SandboxAdminGateway   a clearly labelled local sandbox seeded from the
 *                         imported catalogue. Nothing leaves this machine.
 *
 * With neither available the mode is `disconnected` and commerce screens say
 * exactly what to configure instead of rendering invented data.
 */
import 'server-only';

import type { Offer } from '@/domain/offers';
import type { Money } from '@/domain/types';

import { config } from '../config';

export type ProductStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

export interface AdminVariant {
  readonly id: string;
  readonly title: string;
  readonly options: ReadonlyArray<{ readonly name: string; readonly value: string }>;
  readonly price: Money;
  readonly compareAtPrice: Money | null;
  readonly sku: string | null;
  readonly barcode: string | null;
  readonly weightGrams: number | null;
  readonly inventoryItemId: string | null;
  /** Total available across locations; null when the item is not tracked. */
  readonly inventoryQuantity: number | null;
}

export interface AdminProductSummary {
  readonly id: string;
  readonly handle: string;
  readonly title: string;
  readonly status: ProductStatus;
  readonly totalInventory: number | null;
  readonly priceMin: Money | null;
  readonly priceMax: Money | null;
  readonly image: { readonly url: string; readonly alt: string } | null;
  readonly variantCount: number;
  readonly updatedAt: string;
}

export interface AdminProduct extends AdminProductSummary {
  readonly descriptionHtml: string;
  readonly productType: string;
  readonly vendor: string;
  readonly tags: readonly string[];
  readonly seoTitle: string;
  readonly seoDescription: string;
  readonly options: ReadonlyArray<{ readonly name: string; readonly values: readonly string[] }>;
  readonly variants: readonly AdminVariant[];
  readonly media: ReadonlyArray<{ readonly id: string; readonly url: string; readonly alt: string }>;
}

export interface ProductInput {
  readonly title: string;
  readonly descriptionHtml: string;
  readonly productType: string;
  readonly vendor: string;
  readonly tags: readonly string[];
  readonly status: ProductStatus;
  readonly seoTitle: string;
  readonly seoDescription: string;
}

export interface ProductCreateInput extends ProductInput {
  /** Up to three option axes. Empty means a single default variant. */
  readonly options: ReadonlyArray<{ readonly name: string; readonly values: readonly string[] }>;
  /** Starting price for every generated variant, in cents. */
  readonly price: number;
  readonly compareAtPrice: number | null;
  readonly skuPrefix: string | null;
}

export interface VariantUpdate {
  readonly id: string;
  readonly price: number;
  readonly compareAtPrice: number | null;
  readonly sku: string | null;
  readonly barcode: string | null;
  readonly weightGrams: number | null;
}

export interface InventoryRow {
  readonly productId: string;
  readonly productTitle: string;
  readonly variantId: string;
  readonly variantTitle: string;
  readonly sku: string | null;
  readonly inventoryItemId: string;
  readonly tracked: boolean;
  readonly locationId: string;
  readonly locationName: string;
  readonly available: number;
  /** Reserved by unfulfilled orders. Null when the source does not expose it. */
  readonly committed: number | null;
  readonly unavailable: number | null;
  readonly onHand: number | null;
}

export interface InventorySetInput {
  readonly inventoryItemId: string;
  readonly locationId: string;
  readonly quantity: number;
  /**
   * The quantity the operator was looking at. The write succeeds only if the
   * stock is still at this number — otherwise a sale or another operator
   * changed it in the meantime and the gateway raises `GatewayConflictError`.
   */
  readonly expectedQuantity: number;
  readonly reason: InventoryReason;
}

export const INVENTORY_REASONS = {
  correction: 'Stock count correction',
  received: 'Stock received',
  restock: 'Return restocked',
  damaged: 'Damaged',
  shrinkage: 'Lost or stolen',
  other: 'Other',
} as const;
export type InventoryReason = keyof typeof INVENTORY_REASONS;

/* ------------------------------------------------------------------ *
 * Orders
 * ------------------------------------------------------------------ */

export type PaymentState =
  | 'pending_payment'
  | 'authorized'
  | 'paid'
  | 'partially_paid'
  | 'partially_refunded'
  | 'refunded'
  | 'voided'
  | 'expired'
  | 'unknown';

export type FulfillmentState =
  | 'unfulfilled'
  | 'partially_fulfilled'
  | 'fulfilled'
  | 'on_hold'
  | 'in_progress'
  | 'scheduled'
  | 'unknown';

export interface OrderStatus {
  readonly payment: PaymentState;
  readonly fulfillment: FulfillmentState;
  readonly cancelled: boolean;
  /** Fulfilled and at least one tracking number exists. */
  readonly hasTracking: boolean;
}

const PAYMENT_MAP: Readonly<Record<string, PaymentState>> = {
  PENDING: 'pending_payment',
  AUTHORIZED: 'authorized',
  PAID: 'paid',
  PARTIALLY_PAID: 'partially_paid',
  PARTIALLY_REFUNDED: 'partially_refunded',
  REFUNDED: 'refunded',
  VOIDED: 'voided',
  EXPIRED: 'expired',
};

const FULFILLMENT_MAP: Readonly<Record<string, FulfillmentState>> = {
  UNFULFILLED: 'unfulfilled',
  OPEN: 'unfulfilled',
  PARTIALLY_FULFILLED: 'partially_fulfilled',
  FULFILLED: 'fulfilled',
  ON_HOLD: 'on_hold',
  IN_PROGRESS: 'in_progress',
  PENDING_FULFILLMENT: 'in_progress',
  REQUEST_DECLINED: 'unfulfilled',
  RESTOCKED: 'unfulfilled',
  SCHEDULED: 'scheduled',
};

/**
 * Maps the provider's own status fields onto the dashboard's vocabulary.
 *
 * Nothing is inferred. In particular there is no "delivered" state: Shopify's
 * order-level status does not establish delivery, so the furthest this goes is
 * "fulfilled, with tracking". An unrecognised value maps to `unknown` and is
 * displayed as such rather than guessed at.
 */
export function mapOrderStatus(input: {
  displayFinancialStatus: string | null | undefined;
  displayFulfillmentStatus: string | null | undefined;
  cancelledAt: string | null | undefined;
  trackingNumbers?: readonly (string | null | undefined)[];
}): OrderStatus {
  const payment = PAYMENT_MAP[(input.displayFinancialStatus ?? '').toUpperCase()] ?? 'unknown';
  const fulfillment = FULFILLMENT_MAP[(input.displayFulfillmentStatus ?? '').toUpperCase()] ?? 'unknown';
  return {
    payment,
    fulfillment,
    cancelled: Boolean(input.cancelledAt),
    hasTracking: (input.trackingNumbers ?? []).some((number) => Boolean(number && number.trim())),
  };
}

export const PAYMENT_LABELS: Record<PaymentState, string> = {
  pending_payment: 'Pending payment',
  authorized: 'Authorized (not captured)',
  paid: 'Paid',
  partially_paid: 'Partially paid',
  partially_refunded: 'Partially refunded',
  refunded: 'Refunded',
  voided: 'Voided',
  expired: 'Payment expired',
  unknown: 'Unknown',
};

export const FULFILLMENT_LABELS: Record<FulfillmentState, string> = {
  unfulfilled: 'Unfulfilled',
  partially_fulfilled: 'Partially fulfilled',
  fulfilled: 'Fulfilled',
  on_hold: 'On hold',
  in_progress: 'In progress',
  scheduled: 'Scheduled',
  unknown: 'Unknown',
};

export function fulfillmentLabel(status: OrderStatus): string {
  if (status.fulfillment === 'fulfilled') return status.hasTracking ? 'Fulfilled — shipped with tracking' : 'Fulfilled';
  return FULFILLMENT_LABELS[status.fulfillment];
}

export interface AdminOrderSummary {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly customerName: string | null;
  readonly email: string | null;
  readonly total: Money;
  readonly status: OrderStatus;
  readonly itemCount: number;
  /** A Shopify test order, or an order created in the sandbox. */
  readonly test: boolean;
}

export interface AdminOrderLine {
  readonly title: string;
  readonly variantTitle: string | null;
  readonly sku: string | null;
  readonly quantity: number;
  readonly unitPrice: Money;
  /** Line total after line-level discounts. */
  readonly total: Money;
  readonly discount: Money;
}

export interface AdminFulfillment {
  readonly id: string;
  readonly status: string;
  readonly createdAt: string;
  readonly trackingNumber: string | null;
  readonly trackingCompany: string | null;
  readonly trackingUrl: string | null;
}

export interface AdminOrder extends AdminOrderSummary {
  readonly lines: readonly AdminOrderLine[];
  readonly subtotal: Money;
  readonly discounts: Money;
  readonly discountCodes: readonly string[];
  readonly shipping: Money;
  readonly tax: Money;
  readonly refunded: Money;
  readonly note: string;
  readonly cancelledAt: string | null;
  readonly cancelReason: string | null;
  readonly shippingAddress: readonly string[];
  readonly fulfillments: readonly AdminFulfillment[];
  /** Fulfillment orders that can still be fulfilled from here. */
  readonly openFulfillmentOrderIds: readonly string[];
  readonly customerId: string | null;
}

export interface OrderQuery {
  readonly search?: string;
  readonly payment?: 'paid' | 'pending' | 'refunded' | 'partially_refunded' | '';
  readonly fulfillment?: 'unfulfilled' | 'partial' | 'fulfilled' | '';
  readonly from?: string;
  readonly to?: string;
  readonly limit?: number;
}

export interface FulfillInput {
  readonly trackingNumber: string | null;
  readonly trackingCompany: string | null;
  readonly trackingUrl: string | null;
  readonly notifyCustomer: boolean;
}

/* ------------------------------------------------------------------ *
 * Customers
 * ------------------------------------------------------------------ */

export interface AdminCustomerSummary {
  readonly id: string;
  readonly name: string;
  readonly email: string | null;
  readonly ordersCount: number;
  readonly totalSpent: Money | null;
  readonly lastOrderAt: string | null;
  /** Provider's own consent state, lower-cased, e.g. `subscribed`. */
  readonly marketingState: string;
  readonly tags: readonly string[];
  readonly createdAt: string;
}

export interface AdminCustomer extends AdminCustomerSummary {
  readonly phone: string | null;
  readonly note: string;
  readonly location: string | null;
  readonly orders: readonly AdminOrderSummary[];
}

/* ------------------------------------------------------------------ *
 * Overview
 * ------------------------------------------------------------------ */

export interface OverviewMetrics {
  readonly from: string;
  readonly to: string;
  readonly currency: string;
  readonly ordersCount: number;
  readonly paidOrders: number;
  /** Sum of order totals for non-cancelled orders in the range. */
  readonly grossSales: Money;
  /** Gross less refunds. */
  readonly netSales: Money;
  readonly averageOrderValue: Money | null;
  readonly awaitingFulfillment: number;
  readonly newCustomers: number | null;
  readonly topSkus: ReadonlyArray<{ readonly label: string; readonly quantity: number; readonly revenue: Money }>;
  readonly discountCodes: ReadonlyArray<{ readonly code: string; readonly orders: number }>;
  /** True when the range held more orders than were read; figures are a floor. */
  readonly truncated: boolean;
  readonly testOrdersExcluded: number;
  readonly source: string;
}

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

export class GatewayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GatewayError';
  }
}

/** Compare-and-set failed: the stock changed since it was read. */
export class GatewayConflictError extends GatewayError {
  constructor(message = 'Stock changed since this page was loaded. Reload to see the current quantity, then try again.') {
    super(message);
    this.name = 'GatewayConflictError';
  }
}

export class GatewayNotFoundError extends GatewayError {
  constructor(what: string) {
    super(`${what} was not found.`);
    this.name = 'GatewayNotFoundError';
  }
}

/* ------------------------------------------------------------------ *
 * Interface
 * ------------------------------------------------------------------ */

export interface CommerceGateway {
  readonly mode: 'shopify' | 'sandbox';
  /** Human label for where this data lives, shown beside every figure. */
  readonly sourceLabel: string;

  listProducts(query?: { search?: string; status?: ProductStatus | '' }): Promise<AdminProductSummary[]>;
  getProduct(id: string): Promise<AdminProduct | null>;
  createProduct(input: ProductCreateInput): Promise<AdminProduct>;
  updateProduct(id: string, input: ProductInput): Promise<AdminProduct>;
  updateVariants(productId: string, variants: readonly VariantUpdate[]): Promise<void>;
  duplicateProduct(id: string, newTitle: string): Promise<AdminProduct>;
  setProductStatus(id: string, status: ProductStatus): Promise<void>;
  addProductImage(id: string, url: string, alt: string): Promise<void>;

  listInventory(): Promise<InventoryRow[]>;
  setInventory(input: InventorySetInput): Promise<void>;

  listOrders(query?: OrderQuery): Promise<AdminOrderSummary[]>;
  getOrder(id: string): Promise<AdminOrder | null>;
  updateOrderNote(id: string, note: string): Promise<void>;
  fulfillOrder(id: string, input: FulfillInput): Promise<void>;

  listCustomers(query?: { search?: string }): Promise<AdminCustomerSummary[]>;
  getCustomer(id: string): Promise<AdminCustomer | null>;
  updateCustomer(id: string, input: { note: string; tags: readonly string[] }): Promise<void>;

  /**
   * Creates the discount an offer describes and returns its id.
   * `productIds` is the resolved eligibility list, or null for "all products".
   */
  createDiscount(offer: Offer, productIds: readonly string[] | null): Promise<{ id: string }>;
  setDiscountActive(id: string, method: Offer['method'], active: boolean): Promise<void>;
  deleteDiscount(id: string, method: Offer['method']): Promise<void>;
  /** Times the discount has been used, or null when unavailable. */
  discountUsage(id: string, method: Offer['method']): Promise<number | null>;

  overview(range: { from: string; to: string }): Promise<OverviewMetrics>;

  /** Deep link to a resource in the provider's own admin, when one exists. */
  externalUrl(kind: 'order' | 'product' | 'customer' | 'settings', idOrPath: string): string | null;
}

/** Scopes the custom app needs. Shown verbatim on the "connect" screen. */
export const REQUIRED_ADMIN_SCOPES = [
  'read_products, write_products',
  'read_inventory, write_inventory',
  'read_locations',
  'read_orders, write_orders',
  'read_merchant_managed_fulfillment_orders, write_merchant_managed_fulfillment_orders',
  'read_customers, write_customers',
  'read_discounts, write_discounts',
  'read_price_rules, write_price_rules',
  'read_publications, write_publications',
  'read_analytics',
] as const;

export type GatewayMode = 'shopify' | 'sandbox' | 'disconnected';

export function gatewayMode(): GatewayMode {
  return config.admin.mode;
}

/**
 * The gateway for the current mode, or null when disconnected. Implementations
 * are imported lazily so the sandbox never loads in a connected deployment.
 */
export async function getGateway(): Promise<CommerceGateway | null> {
  const mode = gatewayMode();
  if (mode === 'shopify') return new (await import('./shopify')).ShopifyAdminGateway();
  if (mode === 'sandbox') return new (await import('./sandbox')).SandboxAdminGateway();
  return null;
}

export const cents = (amount: number, currency = 'CAD'): Money => ({
  amount: Math.round(amount),
  currency: currency === 'USD' ? 'USD' : 'CAD',
});
