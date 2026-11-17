// @vitest-environment node
/**
 * Shopify integration contracts, exercised against a mocked transport (no
 * network). These prove request shapes, error handling and mappings; they do
 * not prove the live store's configuration — see docs/test-evidence.md.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { deliveryProgress, orderState } from '@/domain/order-status';
import { approvalProblems, bundleConfigSchema, estimatedTotalSaving, percentageConfigSchema, previewOffers, seedPromotionDrafts, shopifyDiscountPlan, type PromotionRecord } from '@/domain/promotions';
import { safeReturnTo } from '@/server/auth/customer';

import { saveProduct, setAvailableQuantity } from './admin';
import { codeChallenge, validateIdTokenClaims } from './customer-account';
import { legacyId, ShopifyApiError, shopifyGraphql, transport } from './graphql';
import { mapStorefrontProduct, type StorefrontProductNode } from './storefront';

const originalFetch = transport.fetch;
afterEach(() => {
  transport.fetch = originalFetch;
  delete process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
});

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

describe('GraphQL transport', () => {
  it('retries throttling and then succeeds', async () => {
    const calls: number[] = [];
    transport.fetch = vi.fn(async () => {
      calls.push(1);
      return calls.length === 1
        ? jsonResponse({ errors: [{ message: 'Throttled', extensions: { code: 'THROTTLED' } }], extensions: { cost: { throttleStatus: { currentlyAvailable: 0, restoreRate: 100000 } } } })
        : jsonResponse({ data: { ok: true } });
    }) as typeof fetch;
    await expect(shopifyGraphql({ endpoint: 'https://x', headers: {}, query: '{ok}' })).resolves.toEqual({ ok: true });
    expect(calls).toHaveLength(2);
  });

  it('does not retry bad credentials', async () => {
    transport.fetch = vi.fn(async () => jsonResponse({}, 401)) as typeof fetch;
    await expect(shopifyGraphql({ endpoint: 'https://x', headers: {}, query: '{ok}' })).rejects.toMatchObject({ kind: 'http', status: 401 });
    expect(transport.fetch).toHaveBeenCalledTimes(1);
  });

  it('turns gids into the numeric ids used by cart permalinks', () => {
    expect(legacyId('gid://shopify/ProductVariant/47082909794524')).toBe('47082909794524');
  });
});

describe('Admin API writes', () => {
  beforeEach(() => {
    process.env.SHOPIFY_ADMIN_ACCESS_TOKEN = 'shpat_test';
  });

  it('refuses to run without an Admin token', async () => {
    delete process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
    await expect(setAvailableQuantity({ inventoryItemId: 'i', locationId: 'l', expectedCurrent: 1, quantity: 2, reason: 'correction', referenceDocumentUri: 'x' })).rejects.toBeInstanceOf(ShopifyApiError);
  });

  it('sends productSet with variants, metafields and media, and treats userErrors as failure', async () => {
    let body: { query: string; variables: { input: Record<string, unknown> } } | null = null;
    transport.fetch = vi.fn(async (_url, init) => {
      body = JSON.parse(String(init?.body));
      return jsonResponse({ data: { productSet: { product: { id: 'gid://shopify/Product/1', handle: 'new-tee' }, userErrors: [] } } });
    }) as typeof fetch;
    const result = await saveProduct({
      title: 'New Tee',
      descriptionHtml: '<p>Pre-made</p>',
      productType: 'T-Shirts',
      vendor: 'Infnity.clo',
      status: 'DRAFT',
      tags: ['new'],
      options: [{ name: 'Size', values: ['S', 'M'] }],
      variants: [
        { optionValues: [{ optionName: 'Size', name: 'S' }], price: '45.00', compareAtPrice: null, sku: 'TEE-S', barcode: null, weightGrams: 240 },
        { optionValues: [{ optionName: 'Size', name: 'M' }], price: '45.00', compareAtPrice: null, sku: 'TEE-M', barcode: null, weightGrams: 240 },
      ],
      newMedia: [{ url: 'https://cdn.shopify.com/x.jpg', alt: 'Front' }],
      facts: { fit: 'Baggy fitted tee', fabric: '250 gsm 100% cotton', care: null, sizeGuide: null },
    });
    expect(result.handle).toBe('new-tee');
    expect(body!.query).toContain('productSet');
    const input = body!.variables.input;
    expect(input.status).toBe('DRAFT');
    expect((input.variants as unknown[]).length).toBe(2);
    expect(input.metafields).toEqual([
      { namespace: 'infnity', key: 'fit', type: 'multi_line_text_field', value: 'Baggy fitted tee' },
      { namespace: 'infnity', key: 'fabric', type: 'multi_line_text_field', value: '250 gsm 100% cotton' },
    ]);
    expect(input.files).toEqual([{ originalSource: 'https://cdn.shopify.com/x.jpg', alt: 'Front', contentType: 'IMAGE' }]);

    transport.fetch = vi.fn(async () => jsonResponse({ data: { productSet: { product: null, userErrors: [{ field: ['title'], message: 'Title can’t be blank' }] } } })) as typeof fetch;
    await expect(
      saveProduct({ title: '', descriptionHtml: '', productType: '', vendor: '', status: 'DRAFT', tags: [], options: [], variants: [], newMedia: [], facts: { fit: null, fabric: null, care: null, sizeGuide: null } }),
    ).rejects.toThrow(/blank/);
  });

  it('sets stock with compare-and-set so a stale screen cannot overwrite a sale', async () => {
    let variables: Record<string, unknown> | null = null;
    transport.fetch = vi.fn(async (_url, init) => {
      variables = JSON.parse(String(init?.body)).variables;
      return jsonResponse({ data: { inventorySetQuantities: { userErrors: [] } } });
    }) as typeof fetch;
    await setAvailableQuantity({ inventoryItemId: 'gid://shopify/InventoryItem/1', locationId: 'gid://shopify/Location/1', expectedCurrent: 7, quantity: 12, reason: 'received', referenceDocumentUri: 'infnity://admin/x' });
    expect(variables).toMatchObject({ input: { name: 'available', quantities: [{ quantity: 12, changeFromQuantity: 7 }] } });

    transport.fetch = vi.fn(async () =>
      jsonResponse({ data: { inventorySetQuantities: { userErrors: [{ field: ['changeFromQuantity'], message: 'The quantity has changed', code: 'CHANGE_FROM_QUANTITY_STALE' }] } } }),
    ) as typeof fetch;
    await expect(setAvailableQuantity({ inventoryItemId: 'i', locationId: 'l', expectedCurrent: 7, quantity: 12, reason: 'correction', referenceDocumentUri: 'x' })).rejects.toThrow(/changed/);
  });
});

describe('Storefront mapping', () => {
  const node: StorefrontProductNode = {
    id: 'gid://shopify/Product/9452044615900',
    handle: 'infnitys-iced-raven-tank',
    title: "INFNITY'S ICED RAVEN TANK",
    descriptionHtml: '<p>Ribbed Tank Top</p><p>220 gsm 100% cotton - basically comfy ASF.</p><p>The model is 5\'2 wearing an S</p>',
    productType: '',
    tags: [],
    publishedAt: '2026-06-29T00:00:00Z',
    options: [{ id: 'o', name: 'Size', optionValues: [{ name: 'S' }, { name: 'M' }] }],
    images: { nodes: [{ id: 'img1', url: 'https://cdn.shopify.com/s/files/RIRI-1.jpg?v=1', altText: null, width: 1600, height: 1600 }] },
    variants: {
      nodes: [
        { id: 'gid://shopify/ProductVariant/1', title: 'S', sku: null, availableForSale: true, price: { amount: '29.99', currencyCode: 'CAD' }, compareAtPrice: { amount: '60.0', currencyCode: 'CAD' }, selectedOptions: [{ name: 'Size', value: 'S' }], image: { id: 'img1' } },
        { id: 'gid://shopify/ProductVariant/2', title: 'M', sku: null, availableForSale: false, price: { amount: '29.99', currencyCode: 'CAD' }, compareAtPrice: null, selectedOptions: [{ name: 'Size', value: 'M' }], image: null },
      ],
    },
    collections: { nodes: [{ handle: 'all' }] },
    fit: { value: 'Fitted' },
    fabric: null,
    care: null,
    sizeGuide: null,
  };

  it('maps money to cents, availability per variant, and brand facts', () => {
    const product = mapStorefrontProduct(node, 0);
    expect(product.id).toBe('9452044615900');
    expect(product.variants[0]).toMatchObject({ id: '1', price: { amount: 2999, currency: 'CAD' }, compareAtPrice: { amount: 6000 }, availability: 'in_stock', mediaId: 'infnitys-iced-raven-tank-media-1' });
    expect(product.variants[1]?.availability).toBe('sold_out');
    expect(product.specification.fit).toBe('Fitted');
    expect(product.specification.materials).toMatch(/220 gsm/);
    expect(product.specification.modelInfo).toMatch(/5'2/);
    expect(product.media[0]?.url).toBe('https://cdn.shopify.com/s/files/RIRI-1.jpg');
  });
});

describe('Customer Account API helpers', () => {
  const token = (claims: Record<string, unknown>) => `x.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.sig`;

  it('derives the S256 PKCE challenge (RFC 7636 test vector)', () => {
    expect(codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('accepts a matching ID token and rejects nonce, audience or expiry mismatches', () => {
    const exp = Math.floor(Date.now() / 1000) + 600;
    expect(validateIdTokenClaims(token({ nonce: 'n', aud: 'client', exp, email: 'a@b.c' }), { nonce: 'n', clientId: 'client' })).toEqual({ email: 'a@b.c' });
    expect(() => validateIdTokenClaims(token({ nonce: 'other', aud: 'client', exp }), { nonce: 'n', clientId: 'client' })).toThrow(/nonce/);
    expect(() => validateIdTokenClaims(token({ nonce: 'n', aud: 'someone-else', exp }), { nonce: 'n', clientId: 'client' })).toThrow(/audience/);
    expect(() => validateIdTokenClaims(token({ nonce: 'n', aud: 'client', exp: 1000 }), { nonce: 'n', clientId: 'client' })).toThrow(/expired/);
  });

  it('only allows same-site relative return paths', () => {
    expect(safeReturnTo('/account/orders')).toBe('/account/orders');
    expect(safeReturnTo('https://evil.example')).toBe('/account');
    expect(safeReturnTo('//evil.example')).toBe('/account');
    expect(safeReturnTo('/\\evil')).toBe('/account');
  });
});

describe('order and delivery status', () => {
  const base = { financialStatus: 'PAID', fulfillmentStatus: 'UNFULFILLED', cancelledAt: null, fulfillments: [] };

  it('never reports delivered without a DELIVERED carrier event', () => {
    expect(orderState({ ...base, fulfillmentStatus: 'FULFILLED', fulfillments: [{ status: 'SUCCESS', latestShipmentStatus: null, trackingNumbers: [] }] })).toBe('fulfilled');
    expect(orderState({ ...base, fulfillmentStatus: 'FULFILLED', fulfillments: [{ status: 'SUCCESS', latestShipmentStatus: 'IN_TRANSIT', trackingNumbers: ['1Z'] }] })).toBe('shipped');
    expect(orderState({ ...base, fulfillmentStatus: 'FULFILLED', fulfillments: [{ status: 'SUCCESS', latestShipmentStatus: 'DELIVERED', trackingNumbers: ['1Z'] }] })).toBe('delivered');
  });

  it('models cancellation, refunds, pending payment and partial fulfilment', () => {
    expect(orderState({ ...base, cancelledAt: '2026-01-01' })).toBe('cancelled');
    expect(orderState({ ...base, financialStatus: 'REFUNDED' })).toBe('refunded');
    expect(orderState({ ...base, financialStatus: 'PENDING' })).toBe('pending_payment');
    expect(orderState({ ...base, fulfillmentStatus: 'PARTIALLY_FULFILLED' })).toBe('partially_fulfilled');
    expect(orderState(base)).toBe('paid_unfulfilled');
  });

  it('only completes progress steps that have evidence', () => {
    const steps = deliveryProgress('shipped')!;
    expect(steps.find((step) => step.key === 'delivered')?.state).toBe('upcoming');
    expect(steps.find((step) => step.key === 'shipped')?.state).toBe('current');
    expect(deliveryProgress('cancelled')).toBeNull();
  });
});

describe('promotions engine', () => {
  const line = (slug: string, cents: number, quantity = 1, compareAt: number | null = null) => ({
    productSlug: slug,
    quantity,
    unitPrice: { amount: cents, currency: 'CAD' as const },
    compareAtUnitPrice: compareAt === null ? null : { amount: compareAt, currency: 'CAD' as const },
  });
  const record = (id: string, status: PromotionRecord['status'], config: PromotionRecord['config']): PromotionRecord => ({ id, name: id, status, config, marginAcknowledged: true, shopifyDiscountId: null });
  const bundle = bundleConfigSchema.parse({ kind: 'bundle', title: 'Bundle of 2', method: 'automatic', minimumQuantity: 2, value: { type: 'percentage', percent: 15 } });

  it('ignores drafts and approved-but-unpublished promotions entirely', () => {
    expect(previewOffers([record('a', 'draft', bundle), record('b', 'approved', bundle)], [line('x', 6000, 2)])).toEqual([]);
  });

  it('computes bundle progress and visible savings maths for live offers', () => {
    const live = [record('b', 'live', bundle)];
    const one = previewOffers(live, [line('x', 6000)]);
    expect(one[0]).toMatchObject({ qualified: false, estimatedSavingCents: 0 });
    expect(one[0]?.message).toMatch(/Add 1 more/);
    const two = previewOffers(live, [line('x', 6000), line('y', 4500)]);
    expect(two[0]).toMatchObject({ qualified: true, estimatedSavingCents: Math.round(10500 * 0.15) });
  });

  it('excludes sale items by default, so a bundle cannot double-discount', () => {
    const offers = previewOffers([record('b', 'live', bundle)], [line('x', 2999, 1, 6000), line('y', 6000)]);
    expect(offers[0]?.qualified).toBe(false);
  });

  it('never promises first-order eligibility before checkout', () => {
    const tenPercent = percentageConfigSchema.parse({ kind: 'percentage', title: '10% off your first order', method: 'code', code: 'WELCOME10', percent: 10, eligibility: 'first_order' });
    const [offer] = previewOffers([record('p', 'live', tenPercent)], [line('x', 6000)]);
    expect(offer).toMatchObject({ qualified: false, estimatedSavingCents: 0, code: 'WELCOME10' });
  });

  it('shows only the best single saving when offers do not combine', () => {
    const percent = percentageConfigSchema.parse({ kind: 'percentage', title: '10% off', method: 'automatic', percent: 10 });
    const promotions = [record('b', 'live', bundle), record('p', 'live', percent)];
    const offers = previewOffers(promotions, [line('x', 6000), line('y', 6000)]);
    expect(estimatedTotalSaving(offers, promotions)).toBe(Math.round(12000 * 0.15));
  });

  it('keeps the seeded owner-note offers unapprovable until the owner decides the missing values', () => {
    const [tenPercent, bundleOfTwo] = seedPromotionDrafts();
    expect(approvalProblems(tenPercent!.config, true)).toContain('Set a discount code, or switch the method to automatic.');
    expect(approvalProblems(bundleOfTwo!.config, true)).toContain('Set the bundle percentage.');
  });

  it('maps a bundle to a native automatic discount with a minimum quantity', () => {
    const plan = shopifyDiscountPlan(bundle, new Date('2026-12-01T00:00:00Z'));
    expect(plan.mutation).toBe('discountAutomaticBasicCreate');
    expect(plan.input).toMatchObject({
      title: 'Bundle of 2',
      startsAt: '2026-12-01T00:00:00.000Z',
      customerGets: { value: { percentage: 0.15 }, items: { all: true } },
      minimumRequirement: { quantity: { greaterThanOrEqualToQuantity: '2' } },
    });
  });

  it('maps a first-order offer to a code discount that needs the no-orders segment', () => {
    const plan = shopifyDiscountPlan(percentageConfigSchema.parse({ kind: 'percentage', title: '10% off', method: 'code', code: 'WELCOME10', percent: 10, eligibility: 'first_order', oncePerCustomer: true }));
    expect(plan.mutation).toBe('discountCodeBasicCreate');
    expect(plan.needsFirstOrderSegment).toBe(true);
    expect(plan.input).toMatchObject({ code: 'WELCOME10', appliesOncePerCustomer: true });
  });
});
