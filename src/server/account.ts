import 'server-only';

import { redirect } from 'next/navigation';

import { getCustomerSession, isSessionExpired } from '@/server/auth/customer';
import { isCustomerAccountConfigured } from '@/server/shopify/config';
import { CUSTOMER_ORDER_QUERY, CUSTOMER_OVERVIEW_QUERY, customerQuery } from '@/server/shopify/customer-account';

export type AccountState =
  | { kind: 'not_configured' }
  | { kind: 'signed_out' }
  | { kind: 'signed_in'; accessToken: string; email: string | null };

/** Resolves the customer's session for an account page, refreshing via redirect when expired. */
export async function accountState(returnTo: string): Promise<AccountState> {
  if (!isCustomerAccountConfigured()) return { kind: 'not_configured' };
  const session = await getCustomerSession();
  if (!session) return { kind: 'signed_out' };
  if (isSessionExpired(session)) redirect(`/account/refresh?returnTo=${encodeURIComponent(returnTo)}`);
  return { kind: 'signed_in', accessToken: session.accessToken, email: session.email };
}

type MoneyV2 = { amount: string; currencyCode: string };

export interface CustomerOverview {
  customer: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    displayName: string;
    creationDate: string;
    emailAddress: { emailAddress: string; marketingState: string } | null;
    phoneNumber: { phoneNumber: string } | null;
    defaultAddress: { id: string; formatted: string[] } | null;
    addresses: { nodes: Array<{ id: string; formatted: string[] }> };
    orders: {
      nodes: Array<{
        id: string;
        name: string;
        number: number;
        processedAt: string;
        cancelledAt: string | null;
        financialStatus: string | null;
        fulfillmentStatus: string | null;
        totalPrice: MoneyV2;
        lineItems: { nodes: Array<{ title: string; quantity: number; image: { url: string; altText: string | null } | null }> };
        fulfillments: { nodes: Array<{ status: string | null; latestShipmentStatus: string | null; trackingInformation: Array<{ number: string | null; company: string | null; url: string | null }> }> };
      }>;
    };
  };
}

export async function loadOverview(accessToken: string): Promise<CustomerOverview> {
  return customerQuery<CustomerOverview>(accessToken, CUSTOMER_OVERVIEW_QUERY);
}

export interface CustomerOrder {
  order: {
    id: string;
    name: string;
    processedAt: string;
    cancelledAt: string | null;
    cancelReason: string | null;
    financialStatus: string | null;
    fulfillmentStatus: string | null;
    statusPageUrl: string | null;
    subtotal: MoneyV2 | null;
    totalShipping: MoneyV2 | null;
    totalTax: MoneyV2 | null;
    totalPrice: MoneyV2;
    totalRefunded: MoneyV2 | null;
    discountApplications: { nodes: Array<{ code?: string; title?: string; value: { amount?: string; currencyCode?: string; percentage?: number } }> };
    shippingAddress: { formatted: string[] } | null;
    lineItems: {
      nodes: Array<{ id: string; title: string; variantTitle: string | null; quantity: number; sku: string | null; price: MoneyV2 | null; totalPrice: MoneyV2 | null; totalDiscount: MoneyV2 | null; image: { url: string; altText: string | null } | null }>;
    };
    fulfillments: {
      nodes: Array<{
        id: string;
        status: string | null;
        createdAt: string;
        estimatedDeliveryAt: string | null;
        latestShipmentStatus: string | null;
        trackingInformation: Array<{ number: string | null; company: string | null; url: string | null }>;
        events: { nodes: Array<{ happenedAt: string; status: string }> };
      }>;
    };
  } | null;
}

/** Token-scoped: Shopify returns null for an order that is not this customer's. */
export async function loadOrder(accessToken: string, orderId: string): Promise<CustomerOrder['order']> {
  const id = /^\d+$/.test(orderId) ? `gid://shopify/Order/${orderId}` : orderId;
  const data = await customerQuery<CustomerOrder>(accessToken, CUSTOMER_ORDER_QUERY, { id });
  return data.order;
}

export function formatShopifyMoney(value: MoneyV2 | null | undefined): string {
  if (!value) return '—';
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: value.currencyCode }).format(Number(value.amount));
}
