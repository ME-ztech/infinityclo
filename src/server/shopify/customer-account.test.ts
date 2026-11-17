// @vitest-environment node
import { createHash, createSign, generateKeyPairSync } from 'node:crypto';

import { beforeEach, describe, expect, it } from 'vitest';

import {
  buildAuthorizationUrl,
  buildLogoutUrl,
  codeChallengeFor,
  createLoginAttempt,
  CustomerAuthError,
  discoverEndpoints,
  exchangeCode,
  fallbackEndpoints,
  refreshTokens,
  resetDiscoveryCacheForTesting,
  safeReturnTo,
  verifyIdToken,
} from './customer-account';

const endpoints = fallbackEndpoints('123', '2026-10');

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...(publicKey.export({ format: 'jwk' }) as Record<string, string>), kid: 'key-1', use: 'sig', alg: 'RS256' };

function signToken(claims: Record<string, unknown>, header: Record<string, unknown> = { alg: 'RS256', kid: 'key-1' }, key = privateKey) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const body = `${encode(header)}.${encode(claims)}`;
  const signature = createSign('RSA-SHA256').update(body).sign(key).toString('base64url');
  return `${body}.${signature}`;
}

const jwksFetcher = (async () => new Response(JSON.stringify({ keys: [jwk] }), { status: 200 })) as unknown as typeof fetch;

const expected = { issuer: endpoints.issuer, clientId: 'client-abc', nonce: 'nonce-1', jwksUri: endpoints.jwksUri };
const goodClaims = () => ({
  iss: endpoints.issuer,
  aud: 'client-abc',
  sub: 'customer-1',
  nonce: 'nonce-1',
  exp: Math.floor(Date.now() / 1000) + 600,
});

beforeEach(() => {
  resetDiscoveryCacheForTesting();
  process.env.SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID = 'client-abc';
});

describe('login attempt', () => {
  it('generates unguessable, distinct state, nonce and verifier', () => {
    const a = createLoginAttempt('/account');
    const b = createLoginAttempt('/account');
    expect(a.state).not.toBe(b.state);
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
    expect(a.codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(a.state.length).toBeGreaterThanOrEqual(32);
  });

  it('derives the S256 challenge as unpadded base64url', () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    // RFC 7636 appendix B test vector.
    expect(codeChallengeFor(verifier)).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
    expect(codeChallengeFor(verifier)).toBe(createHash('sha256').update(verifier).digest('base64url'));
    expect(codeChallengeFor(verifier)).not.toMatch(/[=+/]/);
  });

  it('builds the authorization request with PKCE, state, nonce and the documented scopes', () => {
    const attempt = createLoginAttempt('/account/orders');
    const url = new URL(buildAuthorizationUrl(endpoints, attempt, 'https://shop.test/api/auth/customer/callback', 'client-abc'));
    expect(url.origin + url.pathname).toBe('https://shopify.com/authentication/123/oauth/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('client-abc');
    expect(url.searchParams.get('scope')).toBe('openid email customer-account-api:full');
    expect(url.searchParams.get('state')).toBe(attempt.state);
    expect(url.searchParams.get('nonce')).toBe(attempt.nonce);
    expect(url.searchParams.get('code_challenge')).toBe(codeChallengeFor(attempt.codeVerifier));
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    // The verifier itself never leaves the server.
    expect(url.toString()).not.toContain(attempt.codeVerifier);
  });
});

describe('safeReturnTo', () => {
  it.each(['/account', '/account/orders/123', '/account/help?order=5', '/cart'])('accepts the internal path %s', (path) => {
    expect(safeReturnTo(path)).toBe(path);
  });

  it.each([
    'https://evil.example/account',
    '//evil.example',
    '/\\evil.example',
    '/account//evil',
    'javascript:alert(1)',
    'account',
    '/api/auth/customer/logout',
    '/account\nSet-Cookie: x=1',
    '',
    null,
    42,
    `/${'a'.repeat(400)}`,
  ])('rejects %j and falls back to /account', (value) => {
    expect(safeReturnTo(value)).toBe('/account');
  });
});

describe('discovery', () => {
  it('uses discovered endpoints from Shopify-owned hosts', async () => {
    const fetcher = (async (url: string) =>
      new Response(
        JSON.stringify(
          String(url).endsWith('openid-configuration')
            ? {
                issuer: 'https://shopify.com/authentication/999',
                authorization_endpoint: 'https://shopify.com/authentication/999/oauth/authorize',
                token_endpoint: 'https://shopify.com/authentication/999/oauth/token',
                end_session_endpoint: 'https://shopify.com/authentication/999/logout',
                jwks_uri: 'https://shopify.com/authentication/999/.well-known/jwks.json',
              }
            : { graphql_api: 'https://shopify.com/999/account/customer/api/2026-10/graphql' },
        ),
        { status: 200 },
      )) as unknown as typeof fetch;
    const found = await discoverEndpoints(fetcher);
    expect(found.tokenEndpoint).toBe('https://shopify.com/authentication/999/oauth/token');
    expect(found.graphqlEndpoint).toBe('https://shopify.com/999/account/customer/api/2026-10/graphql');
  });

  it('ignores endpoints on hosts Shopify does not own', async () => {
    const fetcher = (async () =>
      new Response(
        JSON.stringify({
          token_endpoint: 'https://evil.example/oauth/token',
          authorization_endpoint: 'http://shopify.com/insecure',
          graphql_api: 'https://evil.example/graphql',
        }),
        { status: 200 },
      )) as unknown as typeof fetch;
    const found = await discoverEndpoints(fetcher);
    expect(found.tokenEndpoint).toMatch(/^https:\/\/shopify\.com\/authentication\/\d+\/oauth\/token$/);
    expect(found.authorizationEndpoint).toMatch(/^https:\/\/shopify\.com\/authentication\//);
    expect(found.graphqlEndpoint).toMatch(/^https:\/\/shopify\.com\//);
  });

  it('falls back to the documented URLs when discovery is unreachable', async () => {
    const fetcher = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    const found = await discoverEndpoints(fetcher);
    expect(found.authorizationEndpoint).toMatch(/^https:\/\/shopify\.com\/authentication\/\d+\/oauth\/authorize$/);
  });
});

describe('token exchange', () => {
  const discoveryThen = (handler: (url: string, init?: RequestInit) => Response) =>
    (async (url: string, init?: RequestInit) =>
      String(url).includes('.well-known') ? new Response('{}', { status: 404 }) : handler(String(url), init)) as unknown as typeof fetch;

  it('sends the code with the PKCE verifier and no client secret', async () => {
    let seen: { body: URLSearchParams; headers: Headers } | null = null;
    const fetcher = discoveryThen((_url, init) => {
      seen = { body: new URLSearchParams(String(init?.body)), headers: new Headers(init?.headers) };
      return new Response(JSON.stringify({ access_token: 'shcat_a', refresh_token: 'r', id_token: 'i', expires_in: 3600 }), { status: 200 });
    });
    const tokens = await exchangeCode({ code: 'c0de', codeVerifier: 'verifier', redirectUri: 'https://shop.test/cb', origin: 'https://shop.test' }, fetcher);
    expect(tokens.accessToken).toBe('shcat_a');
    expect(tokens.expiresAt).toBeGreaterThan(Date.now());
    expect(seen!.body.get('grant_type')).toBe('authorization_code');
    expect(seen!.body.get('code_verifier')).toBe('verifier');
    expect(seen!.body.get('client_id')).toBe('client-abc');
    expect(seen!.body.has('client_secret')).toBe(false);
    expect(seen!.headers.get('authorization')).toBeNull();
    expect(seen!.headers.get('origin')).toBe('https://shop.test');
    expect(seen!.headers.get('user-agent')).toBeTruthy();
  });

  it('rejects a refused code', async () => {
    const fetcher = discoveryThen(() => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }));
    await expect(
      exchangeCode({ code: 'bad', codeVerifier: 'v', redirectUri: 'https://shop.test/cb', origin: 'https://shop.test' }, fetcher),
    ).rejects.toMatchObject({ code: 'token_exchange_failed' });
  });

  it('refuses to refresh a session that has no refresh token', async () => {
    await expect(
      refreshTokens({ accessToken: 'a', refreshToken: null, idToken: null, expiresAt: 0 }, 'https://shop.test'),
    ).rejects.toBeInstanceOf(CustomerAuthError);
  });

  it('keeps the previous ID token when a refresh does not return one', async () => {
    const fetcher = discoveryThen(() => new Response(JSON.stringify({ access_token: 'new', refresh_token: 'r2', expires_in: 60 }), { status: 200 }));
    const tokens = await refreshTokens({ accessToken: 'old', refreshToken: 'r1', idToken: 'id-1', expiresAt: 0 }, 'https://shop.test', fetcher);
    expect(tokens).toMatchObject({ accessToken: 'new', refreshToken: 'r2', idToken: 'id-1' });
  });
});

describe('verifyIdToken', () => {
  it('accepts a correctly signed token with matching claims', async () => {
    const claims = await verifyIdToken(signToken(goodClaims()), expected, jwksFetcher);
    expect(claims.sub).toBe('customer-1');
  });

  it.each([
    ['a different nonce (replayed login)', { nonce: 'other' }, 'nonce mismatch'],
    ['another client as audience', { aud: 'someone-else' }, 'wrong audience'],
    ['another issuer', { iss: 'https://evil.example' }, 'wrong issuer'],
    ['an expired token', { exp: Math.floor(Date.now() / 1000) - 3600 }, 'expired'],
  ])('rejects %s', async (_name, override, reason) => {
    await expect(verifyIdToken(signToken({ ...goodClaims(), ...override }), expected, jwksFetcher)).rejects.toThrow(reason);
  });

  it('rejects a token signed by a different key', async () => {
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    await expect(verifyIdToken(signToken(goodClaims(), undefined, other), expected, jwksFetcher)).rejects.toThrow('bad signature');
  });

  it('rejects an unsigned token', async () => {
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${encode({ alg: 'none' })}.${encode(goodClaims())}.`;
    await expect(verifyIdToken(unsigned, expected, jwksFetcher)).rejects.toThrow('unexpected signing algorithm');
  });

  it('rejects a token whose payload was altered after signing', async () => {
    const [header, , signature] = signToken(goodClaims()).split('.');
    const forged = Buffer.from(JSON.stringify({ ...goodClaims(), sub: 'customer-2' })).toString('base64url');
    await expect(verifyIdToken(`${header}.${forged}.${signature}`, expected, jwksFetcher)).rejects.toThrow('bad signature');
  });
});

describe('logout', () => {
  it('sends the ID token hint and the post-logout redirect to the end-session endpoint', () => {
    const url = new URL(buildLogoutUrl(endpoints, 'id-token', 'https://shop.test/account'));
    expect(url.origin + url.pathname).toBe('https://shopify.com/authentication/123/logout');
    expect(url.searchParams.get('id_token_hint')).toBe('id-token');
    expect(url.searchParams.get('post_logout_redirect_uri')).toBe('https://shop.test/account');
  });
});
