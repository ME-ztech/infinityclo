/**
 * Customer account data access.
 *
 * Pages and route handlers talk to this interface, never to Shopify directly.
 * Every method takes the *session's own access token* and nothing else that
 * identifies a customer: Shopify scopes each response to the token's owner, so
 * there is no customer-id parameter to tamper with and no way to phrase a
 * request for somebody else's data.
 *
 * `ShopifyCustomerGateway` is the real implementation. `FixtureCustomerGateway`
 * is a test double that enforces the same isolation rule over in-memory data.
 */
import 'server-only';

import { fromGid, toGid } from '../shopify/client';
import { CustomerAuthError, customerAccountQuery, type CustomerUserError } from '../shopify/customer-account';

export interface MoneyValue {
  readonly amount: string;
  readonly currencyCode: string;
}

export interface CustomerProfile {
  readonly id: string;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly displayName: string;
  readonly email: string | null;
  /** SUBSCRIBED, UNSUBSCRIBED, PENDING… exactly as Shopify reports it; null when unknown. */
  readonly marketingState: string | null;
}

export interface CustomerAddress {
  readonly id: string;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly company: string | null;
  readonly address1: string | null;
  readonly address2: string | null;
  readonly city: string | null;
  readonly zoneCode: string | null;
  readonly territoryCode: string | null;
  readonly zip: string | null;
  readonly phoneNumber: string | null;
  readonly formatted: readonly string[];
  readonly isDefault: boolean;
}

export interface AddressInput {
  readonly firstName: string;
  readonly lastName: string;
  readonly company: string;
  readonly address1: string;
  readonly address2: string;
  readonly city: string;
  readonly zoneCode: string;
  readonly territoryCode: string;
  readonly zip: string;
  readonly phoneNumber: string;
}

export interface OrderSummary {
  readonly id: string;
  readonly name: string;
  readonly processedAt: string;
  readonly cancelledAt: string | null;
  readonly financialStatus: string | null;
  readonly fulfillmentStatus: string | null;
  readonly total: MoneyValue;
}

export interface OrderLineItem {
  readonly id: string;
  readonly title: string;
  readonly variantTitle: string | null;
  readonly quantity: number;
  readonly unitPrice: MoneyValue | null;
  readonly total: MoneyValue | null;
  readonly totalDiscount: MoneyValue | null;
  readonly image: { readonly url: string; readonly alt: string } | null;
}

export interface OrderDiscount {
  readonly label: string;
  /** Either a fixed amount or a percentage, as applied by Shopify. */
  readonly amount: MoneyValue | null;
  readonly percentage: number | null;
}

export interface OrderFulfillment {
  readonly id: string;
  readonly status: string | null;
  readonly latestShipmentStatus: string | null;
  readonly createdAt: string;
  readonly estimatedDeliveryAt: string | null;
  readonly tracking: ReadonlyArray<{ readonly number: string | null; readonly company: string | null; readonly url: string | null }>;
  readonly events: ReadonlyArray<{ readonly status: string; readonly happenedAt: string }>;
}

export interface OrderDetail extends OrderSummary {
  readonly statusPageUrl: string | null;
  readonly lineItems: readonly OrderLineItem[];
  readonly discounts: readonly OrderDiscount[];
  readonly subtotal: MoneyValue | null;
  readonly shipping: MoneyValue | null;
  readonly tax: MoneyValue | null;
  readonly refunded: MoneyValue | null;
  readonly fulfillments: readonly OrderFulfillment[];
  readonly shippingAddress: readonly string[];
}

export type MutationResult<T = undefined> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly string[] };

export interface CustomerAccountGateway {
  getProfile(accessToken: string): Promise<CustomerProfile>;
  listOrders(accessToken: string, limit?: number): Promise<OrderSummary[]>;
  /** Resolves null when the order does not exist *for this customer*. */
  getOrder(accessToken: string, orderId: string): Promise<OrderDetail | null>;
  listAddresses(accessToken: string): Promise<CustomerAddress[]>;
  updateProfile(accessToken: string, input: { firstName: string; lastName: string }): Promise<MutationResult>;
  setMarketingConsent(accessToken: string, subscribed: boolean): Promise<MutationResult<{ marketingState: string | null }>>;
  createAddress(accessToken: string, input: AddressInput, makeDefault: boolean): Promise<MutationResult>;
  updateAddress(accessToken: string, addressId: string, input: AddressInput, makeDefault: boolean): Promise<MutationResult>;
  deleteAddress(accessToken: string, addressId: string): Promise<MutationResult>;
}

/* ------------------------------------------------------------------ *
 * Shopify
 * ------------------------------------------------------------------ */

const MONEY = 'amount currencyCode';

const PROFILE_QUERY = /* GraphQL */ `
  query CustomerProfile {
    customer {
      id
      firstName
      lastName
      displayName
      emailAddress { emailAddress marketingState }
    }
  }
`;

const ORDERS_QUERY = /* GraphQL */ `
  query CustomerOrders($first: Int!) {
    customer {
      orders(first: $first, sortKey: PROCESSED_AT, reverse: true) {
        nodes {
          id
          name
          processedAt
          cancelledAt
          financialStatus
          fulfillmentStatus
          totalPrice { ${MONEY} }
        }
      }
    }
  }
`;

const ORDER_QUERY = /* GraphQL */ `
  query CustomerOrder($id: ID!) {
    order(id: $id) {
      id
      name
      processedAt
      cancelledAt
      financialStatus
      fulfillmentStatus
      statusPageUrl
      subtotal { ${MONEY} }
      totalShipping { ${MONEY} }
      totalTax { ${MONEY} }
      totalPrice { ${MONEY} }
      totalRefunded { ${MONEY} }
      shippingAddress { formatted }
      discountApplications(first: 10) {
        nodes {
          __typename
          value {
            __typename
            ... on MoneyV2 { ${MONEY} }
            ... on PricingPercentageValue { percentage }
          }
          ... on DiscountCodeApplication { code }
          ... on AutomaticDiscountApplication { title }
          ... on ManualDiscountApplication { title }
          ... on ScriptDiscountApplication { title }
        }
      }
      lineItems(first: 50) {
        nodes {
          id
          title
          variantTitle
          quantity
          price { ${MONEY} }
          totalPrice { ${MONEY} }
          totalDiscount { ${MONEY} }
          image { url altText }
        }
      }
      fulfillments(first: 20) {
        nodes {
          id
          status
          latestShipmentStatus
          createdAt
          estimatedDeliveryAt
          trackingInformation { number company url }
          events(first: 30) { nodes { status happenedAt } }
        }
      }
    }
  }
`;

const ADDRESS_FIELDS = 'id firstName lastName company address1 address2 city zoneCode territoryCode zip phoneNumber formatted';

const ADDRESSES_QUERY = /* GraphQL */ `
  query CustomerAddresses {
    customer {
      defaultAddress { id }
      addresses(first: 30) { nodes { ${ADDRESS_FIELDS} } }
    }
  }
`;

const USER_ERRORS = 'userErrors { field message code }';

const errorsOf = (errors: readonly CustomerUserError[] | null | undefined): string[] =>
  (errors ?? []).map((error) => error.message).filter(Boolean);

const result = (errors: readonly CustomerUserError[] | null | undefined): MutationResult =>
  errorsOf(errors).length ? { ok: false, errors: errorsOf(errors) } : { ok: true, value: undefined };

/** Empty strings are sent as null so Shopify clears the field instead of rejecting it. */
function addressInput(input: AddressInput): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(input)) out[key] = value === '' ? null : value;
  return out;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- GraphQL payloads are mapped field by field below. */

export function mapOrderSummary(node: any): OrderSummary {
  return {
    id: fromGid(String(node.id)),
    name: String(node.name ?? ''),
    processedAt: String(node.processedAt ?? ''),
    cancelledAt: node.cancelledAt ?? null,
    financialStatus: node.financialStatus ?? null,
    fulfillmentStatus: node.fulfillmentStatus ?? null,
    total: node.totalPrice,
  };
}

export function mapOrderDetail(node: any): OrderDetail {
  return {
    ...mapOrderSummary(node),
    statusPageUrl: node.statusPageUrl ?? null,
    subtotal: node.subtotal ?? null,
    shipping: node.totalShipping ?? null,
    tax: node.totalTax ?? null,
    refunded: node.totalRefunded ?? null,
    shippingAddress: node.shippingAddress?.formatted ?? [],
    discounts: (node.discountApplications?.nodes ?? []).map((application: any): OrderDiscount => ({
      label: application.code ?? application.title ?? 'Discount',
      amount: application.value?.__typename === 'MoneyV2' ? { amount: application.value.amount, currencyCode: application.value.currencyCode } : null,
      percentage: typeof application.value?.percentage === 'number' ? application.value.percentage : null,
    })),
    lineItems: (node.lineItems?.nodes ?? []).map((item: any): OrderLineItem => ({
      id: String(item.id),
      title: String(item.title ?? ''),
      variantTitle: item.variantTitle && item.variantTitle !== 'Default Title' ? item.variantTitle : null,
      quantity: Number(item.quantity ?? 0),
      unitPrice: item.price ?? null,
      total: item.totalPrice ?? null,
      totalDiscount: item.totalDiscount && Number(item.totalDiscount.amount) > 0 ? item.totalDiscount : null,
      image: item.image?.url ? { url: item.image.url, alt: item.image.altText ?? '' } : null,
    })),
    fulfillments: (node.fulfillments?.nodes ?? []).map((fulfillment: any): OrderFulfillment => ({
      id: String(fulfillment.id),
      status: fulfillment.status ?? null,
      latestShipmentStatus: fulfillment.latestShipmentStatus ?? null,
      createdAt: String(fulfillment.createdAt ?? ''),
      estimatedDeliveryAt: fulfillment.estimatedDeliveryAt ?? null,
      tracking: (fulfillment.trackingInformation ?? []).map((entry: any) => ({
        number: entry.number || null,
        company: entry.company || null,
        url: entry.url || null,
      })),
      events: (fulfillment.events?.nodes ?? []).map((event: any) => ({ status: String(event.status), happenedAt: String(event.happenedAt) })),
    })),
  };
}

export class ShopifyCustomerGateway implements CustomerAccountGateway {
  constructor(
    private readonly origin: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private run<T>(accessToken: string, query: string, variables: Record<string, unknown> = {}): Promise<T> {
    return customerAccountQuery<T>(accessToken, query, variables, { origin: this.origin, fetcher: this.fetcher });
  }

  async getProfile(accessToken: string): Promise<CustomerProfile> {
    const data = await this.run<any>(accessToken, PROFILE_QUERY);
    const customer = data.customer;
    if (!customer) throw new CustomerAuthError('No customer for this session.', 'unauthorized');
    return {
      id: fromGid(String(customer.id)),
      firstName: customer.firstName ?? null,
      lastName: customer.lastName ?? null,
      displayName: customer.displayName ?? '',
      email: customer.emailAddress?.emailAddress ?? null,
      marketingState: customer.emailAddress?.marketingState ?? null,
    };
  }

  async listOrders(accessToken: string, limit = 30): Promise<OrderSummary[]> {
    const data = await this.run<any>(accessToken, ORDERS_QUERY, { first: Math.min(Math.max(limit, 1), 50) });
    return (data.customer?.orders?.nodes ?? []).map(mapOrderSummary);
  }

  async getOrder(accessToken: string, orderId: string): Promise<OrderDetail | null> {
    if (!/^\d{1,20}$/.test(orderId)) return null;
    let data: any;
    try {
      data = await this.run<any>(accessToken, ORDER_QUERY, { id: toGid('Order', orderId) });
    } catch (error) {
      // An id the customer may not read comes back as a GraphQL error or null;
      // both mean "not yours". A dead session must still surface as such.
      if (error instanceof CustomerAuthError && error.code === 'api_error') return null;
      throw error;
    }
    return data.order ? mapOrderDetail(data.order) : null;
  }

  async listAddresses(accessToken: string): Promise<CustomerAddress[]> {
    const data = await this.run<any>(accessToken, ADDRESSES_QUERY);
    const defaultId = data.customer?.defaultAddress?.id ?? null;
    return (data.customer?.addresses?.nodes ?? []).map((node: any): CustomerAddress => ({
      id: fromGid(String(node.id)),
      firstName: node.firstName ?? null,
      lastName: node.lastName ?? null,
      company: node.company ?? null,
      address1: node.address1 ?? null,
      address2: node.address2 ?? null,
      city: node.city ?? null,
      zoneCode: node.zoneCode ?? null,
      territoryCode: node.territoryCode ?? null,
      zip: node.zip ?? null,
      phoneNumber: node.phoneNumber ?? null,
      formatted: node.formatted ?? [],
      isDefault: node.id === defaultId,
    }));
  }

  async updateProfile(accessToken: string, input: { firstName: string; lastName: string }): Promise<MutationResult> {
    const data = await this.run<any>(
      accessToken,
      `mutation UpdateProfile($input: CustomerUpdateInput!) { customerUpdate(input: $input) { customer { id } ${USER_ERRORS} } }`,
      { input: { firstName: input.firstName || null, lastName: input.lastName || null } },
    );
    return result(data.customerUpdate?.userErrors);
  }

  async setMarketingConsent(accessToken: string, subscribed: boolean): Promise<MutationResult<{ marketingState: string | null }>> {
    const field = subscribed ? 'customerEmailMarketingSubscribe' : 'customerEmailMarketingUnsubscribe';
    const data = await this.run<any>(
      accessToken,
      `mutation Marketing { ${field} { emailAddress { emailAddress marketingState } ${USER_ERRORS} } }`,
    );
    const payload = data[field];
    const errors = (payload?.userErrors ?? []) as CustomerUserError[];
    // Asking for the state the customer is already in is a success, not a failure.
    const real = errors.filter((error) => !/ALREADY/.test(error.code ?? ''));
    if (real.length) return { ok: false, errors: errorsOf(real) };
    return { ok: true, value: { marketingState: payload?.emailAddress?.marketingState ?? null } };
  }

  async createAddress(accessToken: string, input: AddressInput, makeDefault: boolean): Promise<MutationResult> {
    const data = await this.run<any>(
      accessToken,
      `mutation CreateAddress($address: CustomerAddressInput!, $defaultAddress: Boolean) { customerAddressCreate(address: $address, defaultAddress: $defaultAddress) { customerAddress { id } ${USER_ERRORS} } }`,
      { address: addressInput(input), defaultAddress: makeDefault },
    );
    return result(data.customerAddressCreate?.userErrors);
  }

  async updateAddress(accessToken: string, addressId: string, input: AddressInput, makeDefault: boolean): Promise<MutationResult> {
    const data = await this.run<any>(
      accessToken,
      `mutation UpdateAddress($addressId: ID!, $address: CustomerAddressInput, $defaultAddress: Boolean) { customerAddressUpdate(addressId: $addressId, address: $address, defaultAddress: $defaultAddress) { customerAddress { id } ${USER_ERRORS} } }`,
      { addressId: toGid('CustomerAddress', addressId), address: addressInput(input), defaultAddress: makeDefault || null },
    );
    return result(data.customerAddressUpdate?.userErrors);
  }

  async deleteAddress(accessToken: string, addressId: string): Promise<MutationResult> {
    const data = await this.run<any>(
      accessToken,
      `mutation DeleteAddress($addressId: ID!) { customerAddressDelete(addressId: $addressId) { deletedAddressId ${USER_ERRORS} } }`,
      { addressId: toGid('CustomerAddress', addressId) },
    );
    return result(data.customerAddressDelete?.userErrors);
  }
}

/* eslint-enable @typescript-eslint/no-explicit-any */

/* ------------------------------------------------------------------ *
 * Test double
 * ------------------------------------------------------------------ */

export interface FixtureCustomer {
  readonly token: string;
  profile: CustomerProfile;
  orders: OrderDetail[];
  addresses: CustomerAddress[];
}

/**
 * In-memory gateway for tests. It models the one property that matters: data is
 * reachable only through the token it belongs to. `calls` records every token
 * the caller presented, so a test can prove a page never asked with another.
 */
export class FixtureCustomerGateway implements CustomerAccountGateway {
  readonly calls: Array<{ method: string; token: string }> = [];

  constructor(private readonly customers: FixtureCustomer[]) {}

  private owner(method: string, token: string): FixtureCustomer {
    this.calls.push({ method, token });
    const customer = this.customers.find((entry) => entry.token === token);
    if (!customer) throw new CustomerAuthError('The customer session is no longer valid.', 'unauthorized');
    return customer;
  }

  async getProfile(token: string) {
    return this.owner('getProfile', token).profile;
  }
  async listOrders(token: string, limit = 30) {
    return this.owner('listOrders', token).orders.slice(0, limit);
  }
  async getOrder(token: string, orderId: string) {
    return this.owner('getOrder', token).orders.find((order) => order.id === orderId) ?? null;
  }
  async listAddresses(token: string) {
    return this.owner('listAddresses', token).addresses;
  }
  async updateProfile(token: string, input: { firstName: string; lastName: string }): Promise<MutationResult> {
    const customer = this.owner('updateProfile', token);
    customer.profile = { ...customer.profile, ...input, displayName: `${input.firstName} ${input.lastName}`.trim() };
    return { ok: true, value: undefined };
  }
  async setMarketingConsent(token: string, subscribed: boolean): Promise<MutationResult<{ marketingState: string | null }>> {
    const customer = this.owner('setMarketingConsent', token);
    const marketingState = subscribed ? 'SUBSCRIBED' : 'UNSUBSCRIBED';
    customer.profile = { ...customer.profile, marketingState };
    return { ok: true, value: { marketingState } };
  }
  async createAddress(token: string, input: AddressInput, makeDefault: boolean): Promise<MutationResult> {
    const customer = this.owner('createAddress', token);
    if (!input.address1) return { ok: false, errors: ['Address line 1 is required.'] };
    if (makeDefault) customer.addresses = customer.addresses.map((address) => ({ ...address, isDefault: false }));
    customer.addresses.push({ ...input, id: String(customer.addresses.length + 1), formatted: [input.address1, input.city], isDefault: makeDefault });
    return { ok: true, value: undefined };
  }
  async updateAddress(token: string, addressId: string, input: AddressInput, makeDefault: boolean): Promise<MutationResult> {
    const customer = this.owner('updateAddress', token);
    if (!customer.addresses.some((address) => address.id === addressId)) return { ok: false, errors: ['Address not found.'] };
    customer.addresses = customer.addresses.map((address) =>
      address.id === addressId
        ? { ...address, ...input, isDefault: makeDefault || address.isDefault }
        : { ...address, isDefault: makeDefault ? false : address.isDefault },
    );
    return { ok: true, value: undefined };
  }
  async deleteAddress(token: string, addressId: string): Promise<MutationResult> {
    const customer = this.owner('deleteAddress', token);
    if (!customer.addresses.some((address) => address.id === addressId)) return { ok: false, errors: ['Address not found.'] };
    customer.addresses = customer.addresses.filter((address) => address.id !== addressId);
    return { ok: true, value: undefined };
  }
}

/* ------------------------------------------------------------------ *
 * Composition
 * ------------------------------------------------------------------ */

const globalGateway = globalThis as typeof globalThis & { __infnityCustomerGateway?: CustomerAccountGateway };

export function getCustomerGateway(origin: string): CustomerAccountGateway {
  return globalGateway.__infnityCustomerGateway ?? new ShopifyCustomerGateway(origin);
}

export function setCustomerGatewayForTesting(gateway: CustomerAccountGateway | null): void {
  globalGateway.__infnityCustomerGateway = gateway ?? undefined;
}
