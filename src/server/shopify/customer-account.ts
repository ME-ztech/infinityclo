import 'server-only';

import { createHash } from 'node:crypto';

import { shopifyConfig } from './config';
import { shopifyGraphql, ShopifyApiError } from './graphql';

/**
 * Shopify Customer Account API — OAuth 2.0 authorization code + PKCE with
 * OIDC discovery, per https://shopify.dev/docs/api/customer.
 *
 * Every query here is scoped by the customer's own access token, so Shopify
 * itself guarantees a customer can only ever read their own data. None of
 * these functions accepts a customer id.
 */

export const CUSTOMER_SCOPES = 'openid email customer-account-api:full';

interface OpenIdConfiguration {
  authorization_endpoint: string;
  token_endpoint: string;
  end_session_endpoint: string;
  issuer: string;
}

let discoveryCache: { at: number; value: OpenIdConfiguration } | null = null;
let apiCache: { at: number; graphqlApi: string } | null = null;
const DISCOVERY_TTL = 60 * 60 * 1000;

function userAgentHeaders(origin?: string): Record<string, string> {
  // Shopify returns 403 without a user-agent and 401 without an allowed origin.
  return { 'user-agent': 'INFNITY-storefront/2.0', ...(origin ? { origin } : {}) };
}

export async function discovery(): Promise<OpenIdConfiguration> {
  if (discoveryCache && Date.now() - discoveryCache.at < DISCOVERY_TTL) return discoveryCache.value;
  const { storeDomain } = shopifyConfig();
  const response = await fetch(`https://${storeDomain}/.well-known/openid-configuration`, {
    headers: userAgentHeaders(),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw new ShopifyApiError(
      `OpenID discovery failed (${response.status})`,
      'http',
      response.status,
    );
  const value = (await response.json()) as OpenIdConfiguration;
  discoveryCache = { at: Date.now(), value };
  return value;
}

async function graphqlEndpoint(): Promise<string> {
  if (apiCache && Date.now() - apiCache.at < DISCOVERY_TTL) return apiCache.graphqlApi;
  const { storeDomain } = shopifyConfig();
  const response = await fetch(`https://${storeDomain}/.well-known/customer-account-api`, {
    headers: userAgentHeaders(),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw new ShopifyApiError(
      `Customer API discovery failed (${response.status})`,
      'http',
      response.status,
    );
  const body = (await response.json()) as { graphql_api: string };
  apiCache = { at: Date.now(), graphqlApi: body.graphql_api };
  return body.graphql_api;
}

/* ------------------------------------------------------------------ *
 * PKCE
 * ------------------------------------------------------------------ */

export function codeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export async function authorizationUrl(params: {
  redirectUri: string;
  state: string;
  nonce: string;
  verifier: string;
  locale?: string;
}): Promise<string> {
  const config = shopifyConfig();
  if (!config.customerAccountClientId)
    throw new ShopifyApiError('Customer accounts are not configured.', 'not_configured');
  const { authorization_endpoint } = await discovery();
  const url = new URL(authorization_endpoint);
  url.searchParams.set('scope', CUSTOMER_SCOPES);
  url.searchParams.set('client_id', config.customerAccountClientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('state', params.state);
  url.searchParams.set('nonce', params.nonce);
  url.searchParams.set('code_challenge', codeChallenge(params.verifier));
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('locale', params.locale ?? 'en');
  url.searchParams.set('region_country', config.defaultCountry);
  return url.toString();
}

export interface CustomerTokens {
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly idToken: string | null;
  /** Epoch ms. */
  readonly expiresAt: number;
}

async function tokenRequest(body: URLSearchParams, origin: string): Promise<CustomerTokens> {
  const config = shopifyConfig();
  const { token_endpoint } = await discovery();
  const headers: Record<string, string> = {
    'content-type': 'application/x-www-form-urlencoded',
    ...userAgentHeaders(origin),
  };
  if (config.customerAccountClientSecret) {
    headers.authorization = `Basic ${Buffer.from(`${config.customerAccountClientId}:${config.customerAccountClientSecret}`).toString('base64')}`;
  }
  const response = await fetch(token_endpoint, {
    method: 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new ShopifyApiError(`Token request failed (${response.status})`, 'http', response.status);
  }
  const json = (await response.json()) as {
    access_token: string;
    expires_in: number;
    id_token?: string;
    refresh_token?: string;
  };
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    idToken: json.id_token ?? null,
    expiresAt: Date.now() + Math.max(60, json.expires_in - 60) * 1000,
  };
}

export async function exchangeCode(params: {
  code: string;
  redirectUri: string;
  verifier: string;
  origin: string;
}): Promise<CustomerTokens> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: shopifyConfig().customerAccountClientId ?? '',
    redirect_uri: params.redirectUri,
    code: params.code,
    code_verifier: params.verifier,
  });
  return tokenRequest(body, params.origin);
}

export async function refreshTokens(refreshToken: string, origin: string): Promise<CustomerTokens> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: shopifyConfig().customerAccountClientId ?? '',
    refresh_token: refreshToken,
  });
  return tokenRequest(body, origin);
}

export async function logoutUrl(
  idToken: string | null,
  postLogoutRedirectUri: string,
): Promise<string | null> {
  if (!idToken) return null;
  const { end_session_endpoint } = await discovery();
  const url = new URL(end_session_endpoint);
  url.searchParams.set('id_token_hint', idToken);
  url.searchParams.set('post_logout_redirect_uri', postLogoutRedirectUri);
  return url.toString();
}

/**
 * Validates the claims of an ID token received directly from the token
 * endpoint over TLS (OIDC Core §3.1.3.7: TLS server validation may stand in for
 * signature checking on this back-channel). Checks nonce, audience and expiry.
 */
export function validateIdTokenClaims(
  idToken: string,
  expected: { nonce: string; clientId: string; now?: number },
): { email: string | null } {
  const [, payloadPart] = idToken.split('.');
  if (!payloadPart) throw new Error('Malformed ID token.');
  const claims = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as {
    nonce?: string;
    aud?: string | string[];
    exp?: number;
    email?: string;
  };
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.nonce !== expected.nonce) throw new Error('ID token nonce mismatch.');
  if (!audience.includes(expected.clientId)) throw new Error('ID token audience mismatch.');
  if (!claims.exp || claims.exp * 1000 < (expected.now ?? Date.now()) - 60_000)
    throw new Error('ID token expired.');
  return { email: claims.email ?? null };
}

/* ------------------------------------------------------------------ *
 * Queries
 * ------------------------------------------------------------------ */

export async function customerQuery<T>(
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  return shopifyGraphql<T>({
    endpoint: await graphqlEndpoint(),
    headers: { authorization: accessToken, ...userAgentHeaders() },
    query,
    variables,
    maxAttempts: 2,
  });
}

const MONEY = 'amount currencyCode';

export const CUSTOMER_OVERVIEW_QUERY = /* GraphQL */ `
  query CustomerOverview {
    customer {
      id
      firstName
      lastName
      displayName
      creationDate
      emailAddress { emailAddress marketingState }
      phoneNumber { phoneNumber }
      defaultAddress { id formatted }
      addresses(first: 20) { nodes { id formatted firstName lastName address1 address2 city province zip country phoneNumber } }
      orders(first: 25, sortKey: PROCESSED_AT, reverse: true) {
        nodes {
          id
          name
          number
          processedAt
          cancelledAt
          financialStatus
          fulfillmentStatus
          totalPrice { ${MONEY} }
          lineItems(first: 3) { nodes { title quantity image { url altText } } }
          fulfillments(first: 5) { nodes { status latestShipmentStatus trackingInformation { number company url } } }
        }
      }
    }
  }
`;

export const CUSTOMER_ORDER_QUERY = /* GraphQL */ `
  query CustomerOrder($id: ID!) {
    order(id: $id) {
      id
      name
      number
      processedAt
      cancelledAt
      cancelReason
      financialStatus
      fulfillmentStatus
      statusPageUrl
      subtotal { ${MONEY} }
      totalShipping { ${MONEY} }
      totalTax { ${MONEY} }
      totalPrice { ${MONEY} }
      totalRefunded { ${MONEY} }
      discountApplications(first: 10) {
        nodes {
          allocationMethod
          value { ... on MoneyV2 { ${MONEY} } ... on PricingPercentageValue { percentage } }
          ... on DiscountCodeApplication { code }
          ... on AutomaticDiscountApplication { title }
        }
      }
      shippingAddress { formatted }
      lineItems(first: 50) {
        nodes {
          id
          title
          variantTitle
          quantity
          sku
          price { ${MONEY} }
          totalPrice { ${MONEY} }
          totalDiscount { ${MONEY} }
          image { url altText }
        }
      }
      fulfillments(first: 10) {
        nodes {
          id
          status
          createdAt
          estimatedDeliveryAt
          latestShipmentStatus
          trackingInformation { number company url }
          events(first: 25) { nodes { happenedAt status } }
        }
      }
    }
  }
`;
