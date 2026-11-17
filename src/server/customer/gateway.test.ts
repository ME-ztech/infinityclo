// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';

import { resetDiscoveryCacheForTesting } from '../shopify/customer-account';
import {
  FixtureCustomerGateway,
  mapOrderDetail,
  ShopifyCustomerGateway,
  type FixtureCustomer,
  type OrderDetail,
} from './gateway';
import { orderProgress, safeTrackingUrl, type FulfillmentLike, type OrderLike } from './order-status';

const order = (id: string, name: string): OrderDetail => ({
  id,
  name,
  processedAt: '2026-10-01T12:00:00Z',
  cancelledAt: null,
  financialStatus: 'PAID',
  fulfillmentStatus: 'UNFULFILLED',
  total: { amount: '60.00', currencyCode: 'CAD' },
  statusPageUrl: null,
  lineItems: [],
  discounts: [],
  subtotal: null,
  shipping: null,
  tax: null,
  refunded: null,
  fulfillments: [],
  shippingAddress: [],
});

const customers = (): FixtureCustomer[] => [
  {
    token: 'token-A',
    profile: { id: '1', firstName: 'Ada', lastName: 'A', displayName: 'Ada A', email: 'ada@example.com', marketingState: 'UNSUBSCRIBED' },
    orders: [order('1001', '#1001')],
    addresses: [],
  },
  {
    token: 'token-B',
    profile: { id: '2', firstName: 'Bo', lastName: 'B', displayName: 'Bo B', email: 'bo@example.com', marketingState: 'SUBSCRIBED' },
    orders: [order('2002', '#2002')],
    addresses: [],
  },
];

describe('customer isolation', () => {
  it('returns only the data belonging to the presented token', async () => {
    const gateway = new FixtureCustomerGateway(customers());
    expect((await gateway.getProfile('token-A')).email).toBe('ada@example.com');
    expect((await gateway.listOrders('token-A')).map((entry) => entry.name)).toEqual(['#1001']);
    expect((await gateway.listOrders('token-B')).map((entry) => entry.name)).toEqual(['#2002']);
  });

  it("answers not-found for another customer's order id", async () => {
    const gateway = new FixtureCustomerGateway(customers());
    expect(await gateway.getOrder('token-A', '1001')).not.toBeNull();
    // Customer A guessing customer B's order id gets nothing.
    expect(await gateway.getOrder('token-A', '2002')).toBeNull();
    expect(await gateway.getOrder('token-B', '1001')).toBeNull();
  });

  it('rejects an unknown or revoked token outright', async () => {
    const gateway = new FixtureCustomerGateway(customers());
    await expect(gateway.getProfile('token-X')).rejects.toMatchObject({ code: 'unauthorized' });
    await expect(gateway.listOrders('')).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('writes only to the account that owns the token', async () => {
    const data = customers();
    const gateway = new FixtureCustomerGateway(data);
    await gateway.updateProfile('token-A', { firstName: 'Changed', lastName: 'Name' });
    await gateway.setMarketingConsent('token-A', true);
    expect(data[0]!.profile).toMatchObject({ firstName: 'Changed', marketingState: 'SUBSCRIBED' });
    expect(data[1]!.profile).toMatchObject({ firstName: 'Bo', marketingState: 'SUBSCRIBED' });
    expect(gateway.calls.every((call) => call.token === 'token-A')).toBe(true);
  });
});

describe('ShopifyCustomerGateway', () => {
  beforeEach(() => resetDiscoveryCacheForTesting());

  function recordingFetch(responses: Array<Record<string, unknown>>) {
    const requests: Array<{ url: string; headers: Headers; body: { query: string; variables: Record<string, unknown> } }> = [];
    const fetcher = (async (url: string, init?: RequestInit) => {
      if (String(url).includes('.well-known')) return new Response('{}', { status: 404 });
      requests.push({ url: String(url), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify(responses.shift() ?? { data: {} }), { status: 200 });
    }) as unknown as typeof fetch;
    return { fetcher, requests };
  }

  it("authenticates with the session's own token and never sends a customer id", async () => {
    const { fetcher, requests } = recordingFetch([{ data: { customer: { orders: { nodes: [] } } } }]);
    await new ShopifyCustomerGateway('https://shop.test', fetcher).listOrders('shcat_mine');
    expect(requests).toHaveLength(1);
    expect(requests[0]!.headers.get('authorization')).toBe('shcat_mine');
    expect(requests[0]!.headers.get('origin')).toBe('https://shop.test');
    expect(requests[0]!.url).toMatch(/^https:\/\/shopify\.com\/\d+\/account\/customer\/api\//);
    expect(Object.keys(requests[0]!.body.variables)).toEqual(['first']);
    expect(requests[0]!.body.query).not.toMatch(/customer\s*\(/);
  });

  it('fetches an order by id through the customer token and maps null to not-found', async () => {
    const { fetcher, requests } = recordingFetch([{ data: { order: null } }]);
    const result = await new ShopifyCustomerGateway('https://shop.test', fetcher).getOrder('shcat_mine', '2002');
    expect(result).toBeNull();
    expect(requests[0]!.headers.get('authorization')).toBe('shcat_mine');
    expect(requests[0]!.body.variables).toEqual({ id: 'gid://shopify/Order/2002' });
  });

  it('treats an access error on an order as not-found rather than leaking it', async () => {
    const { fetcher } = recordingFetch([{ errors: [{ message: 'Access denied' }] }]);
    expect(await new ShopifyCustomerGateway('https://shop.test', fetcher).getOrder('shcat_mine', '2002')).toBeNull();
  });

  it('never queries Shopify for a malformed order id', async () => {
    const { fetcher, requests } = recordingFetch([]);
    const gateway = new ShopifyCustomerGateway('https://shop.test', fetcher);
    expect(await gateway.getOrder('shcat_mine', 'gid://shopify/Order/1')).toBeNull();
    expect(await gateway.getOrder('shcat_mine', '1 OR 1=1')).toBeNull();
    expect(requests).toHaveLength(0);
  });

  it('surfaces a dead session as unauthorized', async () => {
    const fetcher = (async (url: string) =>
      String(url).includes('.well-known') ? new Response('{}', { status: 404 }) : new Response('', { status: 401 })) as unknown as typeof fetch;
    await expect(new ShopifyCustomerGateway('https://shop.test', fetcher).getProfile('expired')).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('returns Shopify userErrors instead of reporting success', async () => {
    const { fetcher } = recordingFetch([
      { data: { customerAddressCreate: { customerAddress: null, userErrors: [{ field: ['address', 'zip'], message: 'Zip is invalid' }] } } },
    ]);
    const result = await new ShopifyCustomerGateway('https://shop.test', fetcher).createAddress(
      'shcat_mine',
      { firstName: 'A', lastName: 'B', company: '', address1: '1 Main', address2: '', city: 'Winnipeg', zoneCode: 'MB', territoryCode: 'CA', zip: 'bad', phoneNumber: '' },
      false,
    );
    expect(result).toEqual({ ok: false, errors: ['Zip is invalid'] });
  });

  it('treats "already subscribed" as success', async () => {
    const { fetcher } = recordingFetch([
      {
        data: {
          customerEmailMarketingSubscribe: {
            emailAddress: { emailAddress: 'a@example.com', marketingState: 'SUBSCRIBED' },
            userErrors: [{ field: null, message: 'Already subscribed', code: 'CUSTOMER_ALREADY_SUBSCRIBED' }],
          },
        },
      },
    ]);
    const result = await new ShopifyCustomerGateway('https://shop.test', fetcher).setMarketingConsent('shcat_mine', true);
    expect(result).toEqual({ ok: true, value: { marketingState: 'SUBSCRIBED' } });
  });
});

describe('order mapping', () => {
  it('keeps tracking only where Shopify supplied it and hides placeholder variant titles', () => {
    const mapped = mapOrderDetail({
      id: 'gid://shopify/Order/77',
      name: '#77',
      processedAt: '2026-10-01T00:00:00Z',
      totalPrice: { amount: '45.00', currencyCode: 'CAD' },
      lineItems: { nodes: [{ id: 'l1', title: 'Tee', variantTitle: 'Default Title', quantity: 1, totalDiscount: { amount: '0.0', currencyCode: 'CAD' } }] },
      fulfillments: { nodes: [{ id: 'f1', status: 'SUCCESS', createdAt: 'x', trackingInformation: [{ number: '', company: '', url: '' }], events: { nodes: [] } }] },
      discountApplications: { nodes: [{ code: 'TEN', value: { __typename: 'PricingPercentageValue', percentage: 10 } }] },
    });
    expect(mapped.id).toBe('77');
    expect(mapped.lineItems[0]).toMatchObject({ variantTitle: null, totalDiscount: null });
    expect(mapped.fulfillments[0]!.tracking[0]).toEqual({ number: null, company: null, url: null });
    expect(mapped.discounts[0]).toEqual({ label: 'TEN', amount: null, percentage: 10 });
  });
});

describe('order progress', () => {
  const fulfillment = (overrides: Partial<FulfillmentLike> = {}): FulfillmentLike => ({
    status: 'SUCCESS',
    latestShipmentStatus: null,
    events: [],
    tracking: [],
    ...overrides,
  });
  const base = (overrides: Partial<OrderLike> = {}): OrderLike => ({
    cancelledAt: null,
    financialStatus: 'PAID',
    fulfillmentStatus: 'UNFULFILLED',
    fulfillments: [],
    ...overrides,
  });

  it('reports a paid, unshipped order as received — not shipped', () => {
    expect(orderProgress(base()).stage).toBe('confirmed');
  });

  it('reports pending payment', () => {
    expect(orderProgress(base({ financialStatus: 'PENDING' })).stage).toBe('awaiting_payment');
  });

  it('reports cancellation ahead of everything else', () => {
    expect(orderProgress(base({ cancelledAt: '2026-10-02T00:00:00Z', fulfillmentStatus: 'FULFILLED', fulfillments: [fulfillment({ latestShipmentStatus: 'DELIVERED' })] })).stage).toBe('cancelled');
  });

  it('never says delivered for a fulfilled order without carrier confirmation', () => {
    const progress = orderProgress(base({ fulfillmentStatus: 'FULFILLED', fulfillments: [fulfillment({ tracking: [{ number: '1Z', company: 'UPS', url: null }] })] }));
    expect(progress.stage).toBe('shipped');
    expect(progress.label).not.toMatch(/deliver/i);
  });

  it.each(['IN_TRANSIT', 'CONFIRMED', 'LABEL_PRINTED', 'ATTEMPTED_DELIVERY', 'DELAYED'])(
    'does not say delivered while the carrier reports %s',
    (status) => {
      const progress = orderProgress(base({ fulfillmentStatus: 'FULFILLED', fulfillments: [fulfillment({ latestShipmentStatus: status })] }));
      expect(progress.stage).not.toBe('delivered');
    },
  );

  it('says delivered only when Shopify reports a delivered shipment', () => {
    expect(orderProgress(base({ fulfillmentStatus: 'FULFILLED', fulfillments: [fulfillment({ latestShipmentStatus: 'DELIVERED' })] })).stage).toBe('delivered');
    expect(
      orderProgress(base({ fulfillmentStatus: 'FULFILLED', fulfillments: [fulfillment({ events: [{ status: 'DELIVERED', happenedAt: '2026-10-05T00:00:00Z' }] })] })).stage,
    ).toBe('delivered');
  });

  it('does not say delivered when only one of two shipments has arrived', () => {
    const progress = orderProgress(
      base({ fulfillmentStatus: 'FULFILLED', fulfillments: [fulfillment({ latestShipmentStatus: 'DELIVERED' }), fulfillment({ latestShipmentStatus: 'IN_TRANSIT' })] }),
    );
    expect(progress.stage).toBe('shipped');
  });

  it('does not say delivered when part of the order has not shipped', () => {
    const progress = orderProgress(base({ fulfillmentStatus: 'PARTIALLY_FULFILLED', fulfillments: [fulfillment({ latestShipmentStatus: 'DELIVERED' })] }));
    expect(progress.stage).toBe('partially_shipped');
  });

  it('ignores cancelled fulfillments', () => {
    expect(orderProgress(base({ fulfillments: [fulfillment({ status: 'CANCELLED', latestShipmentStatus: 'DELIVERED' })] })).stage).toBe('confirmed');
  });

  it('reports out for delivery and carrier problems', () => {
    expect(orderProgress(base({ fulfillmentStatus: 'FULFILLED', fulfillments: [fulfillment({ latestShipmentStatus: 'OUT_FOR_DELIVERY' })] })).stage).toBe('out_for_delivery');
    expect(orderProgress(base({ fulfillmentStatus: 'FULFILLED', fulfillments: [fulfillment({ latestShipmentStatus: 'FAILURE' })] })).stage).toBe('attention');
  });

  it('says so when a shipment has no tracking number', () => {
    const progress = orderProgress(base({ fulfillmentStatus: 'FULFILLED', fulfillments: [fulfillment()] }));
    expect(progress.detail).toMatch(/No tracking number/);
  });

  it('only links http(s) tracking URLs', () => {
    expect(safeTrackingUrl('https://carrier.example/track?n=1')).toBe('https://carrier.example/track?n=1');
    expect(safeTrackingUrl('javascript:alert(1)')).toBeNull();
    expect(safeTrackingUrl('')).toBeNull();
    expect(safeTrackingUrl(null)).toBeNull();
  });
});
