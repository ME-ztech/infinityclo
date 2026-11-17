/**
 * Shopify Customer Account API — OAuth 2.0 authorization code flow with PKCE.
 *
 * Customers sign in on Shopify's hosted, passwordless login. This application
 * never sees or stores a customer password; it holds only the tokens Shopify
 * issues, sealed inside an httpOnly cookie (see `src/server/customer/session.ts`).
 *
 * Endpoints are discovered, not hard-coded, exactly as the API documents:
 *
 *   https://<shop-domain>/.well-known/openid-configuration   authorize / token / logout / JWKS
 *   https://<shop-domain>/.well-known/customer-account-api   GraphQL endpoint
 *
 * with the documented `shopify.com/authentication/<shop_id>` URLs as the
 * fallback when discovery cannot be reached.
 *
 * This is a *public client*: there is no client secret, and the code exchange
 * is protected by PKCE (S256), `state` (CSRF) and `nonce` (replay).
 */
import 'server-only';

import { createHash, createPublicKey, createVerify, randomBytes } from 'node:crypto';

import { config } from '../config';

export const CUSTOMER_SCOPES = 'openid email customer-account-api:full';

/** Shopify answers 403 to requests without a user agent. */
const USER_AGENT = 'INFNITY-storefront/1.0';

export class CustomerAuthError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'not_configured'
      | 'discovery_failed'
      | 'token_exchange_failed'
      | 'invalid_id_token'
      | 'refresh_failed'
      | 'unauthorized'
      | 'api_error',
  ) {
    super(message);
    this.name = 'CustomerAuthError';
  }
}

export function isCustomerAuthConfigured(): boolean {
  return Boolean(config.shopify.customerAccountClientId);
}

/* ------------------------------------------------------------------ *
 * Discovery
 * ------------------------------------------------------------------ */

export interface CustomerAuthEndpoints {
  readonly issuer: string;
  readonly authorizationEndpoint: string;
  readonly tokenEndpoint: string;
  readonly endSessionEndpoint: string;
  readonly jwksUri: string;
  readonly graphqlEndpoint: string;
}

export function fallbackEndpoints(shopId: string, apiVersion: string): CustomerAuthEndpoints {
  const base = `https://shopify.com/authentication/${shopId}`;
  return {
    issuer: base,
    authorizationEndpoint: `${base}/oauth/authorize`,
    tokenEndpoint: `${base}/oauth/token`,
    endSessionEndpoint: `${base}/logout`,
    jwksUri: `${base}/.well-known/jwks.json`,
    graphqlEndpoint: `https://shopify.com/${shopId}/account/customer/api/${apiVersion}/graphql`,
  };
}

/** Only Shopify-owned hosts are accepted from a discovery document. */
function trustedUrl(value: unknown, storeDomain: string): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase();
    const trusted =
      host === 'shopify.com' ||
      host.endsWith('.shopify.com') ||
      host === storeDomain.toLowerCase() ||
      host.endsWith('.myshopify.com');
    return trusted ? url.toString() : null;
  } catch {
    return null;
  }
}

let cachedEndpoints: { at: number; key: string; value: CustomerAuthEndpoints } | null = null;
const DISCOVERY_TTL_MS = 60 * 60 * 1000;

export async function discoverEndpoints(fetcher: typeof fetch = fetch): Promise<CustomerAuthEndpoints> {
  const { storeDomain, shopId, storefrontApiVersion } = config.shopify;
  const key = `${storeDomain}:${shopId}`;
  if (cachedEndpoints && cachedEndpoints.key === key && Date.now() - cachedEndpoints.at < DISCOVERY_TTL_MS) {
    return cachedEndpoints.value;
  }
  const fallback = fallbackEndpoints(shopId, storefrontApiVersion);
  let value = fallback;
  try {
    const init = { headers: { accept: 'application/json', 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(8000), cache: 'no-store' as const };
    const [openid, api] = await Promise.all([
      fetcher(`https://${storeDomain}/.well-known/openid-configuration`, init).then((r) => (r.ok ? r.json() : null)),
      fetcher(`https://${storeDomain}/.well-known/customer-account-api`, init).then((r) => (r.ok ? r.json() : null)),
    ]);
    const doc = (openid ?? {}) as Record<string, unknown>;
    const apiDoc = (api ?? {}) as Record<string, unknown>;
    value = {
      issuer: typeof doc.issuer === 'string' && trustedUrl(doc.issuer, storeDomain) ? doc.issuer : fallback.issuer,
      authorizationEndpoint: trustedUrl(doc.authorization_endpoint, storeDomain) ?? fallback.authorizationEndpoint,
      tokenEndpoint: trustedUrl(doc.token_endpoint, storeDomain) ?? fallback.tokenEndpoint,
      endSessionEndpoint: trustedUrl(doc.end_session_endpoint, storeDomain) ?? fallback.endSessionEndpoint,
      jwksUri: trustedUrl(doc.jwks_uri, storeDomain) ?? fallback.jwksUri,
      graphqlEndpoint: trustedUrl(apiDoc.graphql_api, storeDomain) ?? fallback.graphqlEndpoint,
    };
  } catch (error) {
    console.warn(`[customer-auth] discovery failed, using documented fallback URLs: ${(error as Error).message}`);
  }
  cachedEndpoints = { at: Date.now(), key, value };
  return value;
}

export function resetDiscoveryCacheForTesting(): void {
  cachedEndpoints = null;
  cachedJwks = null;
}

/* ------------------------------------------------------------------ *
 * PKCE, state, nonce
 * ------------------------------------------------------------------ */

const base64url = (buffer: Buffer): string => buffer.toString('base64url');

export interface LoginAttempt {
  readonly state: string;
  readonly nonce: string;
  readonly codeVerifier: string;
  readonly returnTo: string;
}

export function codeChallengeFor(verifier: string): string {
  return base64url(createHash('sha256').update(verifier).digest());
}

export function createLoginAttempt(returnTo: string): LoginAttempt {
  return {
    state: base64url(randomBytes(24)),
    nonce: base64url(randomBytes(24)),
    codeVerifier: base64url(randomBytes(48)),
    returnTo: safeReturnTo(returnTo),
  };
}

/**
 * Only same-site paths are accepted as a post-login destination. Absolute URLs,
 * protocol-relative URLs (`//evil.example`), backslash tricks and anything with
 * control characters fall back to `/account`, so sign-in can never be used as
 * an open redirect.
 */
export function safeReturnTo(value: unknown, fallback = '/account'): string {
  if (typeof value !== 'string' || value.length > 300) return fallback;
  if (!/^\/(?![/\\])[A-Za-z0-9\-._~/?&=%+#:@!$,;]*$/.test(value)) return fallback;
  if (value.includes('\\') || value.includes('//')) return fallback;
  if (value.startsWith('/api/')) return fallback;
  return value;
}

export function buildAuthorizationUrl(
  endpoints: CustomerAuthEndpoints,
  attempt: LoginAttempt,
  redirectUri: string,
  clientId: string,
): string {
  const url = new URL(endpoints.authorizationEndpoint);
  url.searchParams.set('scope', CUSTOMER_SCOPES);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', attempt.state);
  url.searchParams.set('nonce', attempt.nonce);
  url.searchParams.set('code_challenge', codeChallengeFor(attempt.codeVerifier));
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

/* ------------------------------------------------------------------ *
 * Tokens
 * ------------------------------------------------------------------ */

export interface TokenSet {
  readonly accessToken: string;
  /** Absent for app clients, which re-authorise instead of refreshing. */
  readonly refreshToken: string | null;
  readonly idToken: string | null;
  /** Epoch milliseconds. */
  readonly expiresAt: number;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  error?: string;
}

async function tokenRequest(
  endpoints: CustomerAuthEndpoints,
  body: URLSearchParams,
  origin: string,
  fetcher: typeof fetch,
): Promise<TokenResponse | null> {
  const response = await fetcher(endpoints.tokenEndpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
      // Both are required by Shopify: the origin must be a registered
      // JavaScript origin, and requests without a user agent are refused.
      origin,
      'user-agent': USER_AGENT,
    },
    body,
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) return null;
  return (await response.json()) as TokenResponse;
}

function toTokenSet(response: TokenResponse, previous?: TokenSet): TokenSet | null {
  if (!response.access_token) return null;
  const lifetime = typeof response.expires_in === 'number' && response.expires_in > 0 ? response.expires_in : 3600;
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token ?? previous?.refreshToken ?? null,
    idToken: response.id_token ?? previous?.idToken ?? null,
    expiresAt: Date.now() + lifetime * 1000,
  };
}

export async function exchangeCode(
  input: { code: string; codeVerifier: string; redirectUri: string; origin: string },
  fetcher: typeof fetch = fetch,
): Promise<TokenSet> {
  const clientId = config.shopify.customerAccountClientId;
  if (!clientId) throw new CustomerAuthError('Customer sign-in is not configured.', 'not_configured');
  const endpoints = await discoverEndpoints(fetcher);
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    redirect_uri: input.redirectUri,
    code: input.code,
    code_verifier: input.codeVerifier,
  });
  const response = await tokenRequest(endpoints, body, input.origin, fetcher).catch(() => null);
  const tokens = response ? toTokenSet(response) : null;
  if (!tokens) throw new CustomerAuthError('Shopify did not accept the sign-in code.', 'token_exchange_failed');
  return tokens;
}

export async function refreshTokens(previous: TokenSet, origin: string, fetcher: typeof fetch = fetch): Promise<TokenSet> {
  const clientId = config.shopify.customerAccountClientId;
  if (!clientId || !previous.refreshToken) {
    throw new CustomerAuthError('This session cannot be refreshed.', 'refresh_failed');
  }
  const endpoints = await discoverEndpoints(fetcher);
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    refresh_token: previous.refreshToken,
  });
  const response = await tokenRequest(endpoints, body, origin, fetcher).catch(() => null);
  const tokens = response ? toTokenSet(response, previous) : null;
  if (!tokens) throw new CustomerAuthError('Shopify did not refresh the session.', 'refresh_failed');
  return tokens;
}

export function buildLogoutUrl(endpoints: CustomerAuthEndpoints, idToken: string | null, postLogoutRedirectUri: string): string {
  const url = new URL(endpoints.endSessionEndpoint);
  if (idToken) url.searchParams.set('id_token_hint', idToken);
  url.searchParams.set('post_logout_redirect_uri', postLogoutRedirectUri);
  return url.toString();
}

/* ------------------------------------------------------------------ *
 * ID token
 * ------------------------------------------------------------------ */

export interface IdTokenClaims {
  readonly iss: string;
  readonly sub: string;
  readonly aud: string | string[];
  readonly exp: number;
  readonly iat?: number;
  readonly nonce?: string;
  readonly email?: string;
  readonly email_verified?: boolean;
}

interface Jwk {
  kid?: string;
  kty: string;
  alg?: string;
  n?: string;
  e?: string;
  use?: string;
}

let cachedJwks: { at: number; uri: string; keys: Jwk[] } | null = null;

async function loadJwks(uri: string, fetcher: typeof fetch, force = false): Promise<Jwk[]> {
  if (!force && cachedJwks && cachedJwks.uri === uri && Date.now() - cachedJwks.at < DISCOVERY_TTL_MS) {
    return cachedJwks.keys;
  }
  const response = await fetcher(uri, {
    headers: { accept: 'application/json', 'user-agent': USER_AGENT },
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new CustomerAuthError('Could not load the sign-in keys.', 'invalid_id_token');
  const body = (await response.json()) as { keys?: Jwk[] };
  const keys = Array.isArray(body.keys) ? body.keys : [];
  cachedJwks = { at: Date.now(), uri, keys };
  return keys;
}

const decodeSegment = <T>(segment: string): T => JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as T;

/**
 * Verifies an ID token: RS256 signature against Shopify's published keys, then
 * issuer, audience, expiry and the nonce bound to this login attempt.
 *
 * Any failure rejects the sign-in. An unsigned (`alg: none`) or differently
 * signed token is refused outright.
 */
export async function verifyIdToken(
  idToken: string,
  expected: { issuer: string; clientId: string; nonce: string; jwksUri: string },
  fetcher: typeof fetch = fetch,
  now: number = Date.now(),
): Promise<IdTokenClaims> {
  const fail = (reason: string) => new CustomerAuthError(`The sign-in response was rejected: ${reason}.`, 'invalid_id_token');
  const parts = idToken.split('.');
  if (parts.length !== 3) throw fail('malformed token');
  let header: { alg?: string; kid?: string };
  let claims: IdTokenClaims;
  try {
    header = decodeSegment(parts[0]!);
    claims = decodeSegment(parts[1]!);
  } catch {
    throw fail('malformed token');
  }
  if (header.alg !== 'RS256') throw fail('unexpected signing algorithm');

  const findKey = (keys: Jwk[]) =>
    keys.find((key) => key.kty === 'RSA' && (header.kid ? key.kid === header.kid : true) && key.use !== 'enc');
  let jwk = findKey(await loadJwks(expected.jwksUri, fetcher));
  // Keys rotate: one forced reload before giving up on an unknown key id.
  if (!jwk) jwk = findKey(await loadJwks(expected.jwksUri, fetcher, true));
  if (!jwk) throw fail('unknown signing key');

  let valid = false;
  try {
    const key = createPublicKey({ key: jwk as unknown as JsonWebKey, format: 'jwk' });
    valid = createVerify('RSA-SHA256')
      .update(`${parts[0]}.${parts[1]}`)
      .verify(key, Buffer.from(parts[2]!, 'base64url'));
  } catch {
    valid = false;
  }
  if (!valid) throw fail('bad signature');

  if (claims.iss !== expected.issuer) throw fail('wrong issuer');
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audience.includes(expected.clientId)) throw fail('wrong audience');
  if (typeof claims.exp !== 'number' || claims.exp * 1000 <= now - 60_000) throw fail('expired');
  if (!claims.nonce || claims.nonce !== expected.nonce) throw fail('nonce mismatch');
  if (!claims.sub) throw fail('no subject');
  return claims;
}

/* ------------------------------------------------------------------ *
 * GraphQL
 * ------------------------------------------------------------------ */

export interface CustomerUserError {
  readonly field?: readonly string[] | null;
  readonly message: string;
  readonly code?: string | null;
}

/**
 * Runs a query as the signed-in customer. The access token *is* the scope: the
 * API returns only that customer's data, so no customer id is ever sent and
 * none is accepted from the browser.
 */
export async function customerAccountQuery<T>(
  accessToken: string,
  query: string,
  variables: Record<string, unknown> = {},
  options: { origin: string; fetcher?: typeof fetch },
): Promise<T> {
  const fetcher = options.fetcher ?? fetch;
  const endpoints = await discoverEndpoints(fetcher);
  let response: Response;
  try {
    response = await fetcher(endpoints.graphqlEndpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        authorization: accessToken,
        origin: options.origin,
        'user-agent': USER_AGENT,
      },
      body: JSON.stringify({ query, variables }),
      // Per-customer data must never enter a shared cache.
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new CustomerAuthError(`Could not reach Shopify: ${(error as Error).message}`, 'api_error');
  }
  if (response.status === 401 || response.status === 403) {
    throw new CustomerAuthError('The customer session is no longer valid.', 'unauthorized');
  }
  if (!response.ok) throw new CustomerAuthError(`Shopify responded ${response.status}.`, 'api_error');
  const body = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (!body.data) {
    throw new CustomerAuthError(body.errors?.[0]?.message ?? 'Shopify returned an empty response.', 'api_error');
  }
  return body.data;
}
