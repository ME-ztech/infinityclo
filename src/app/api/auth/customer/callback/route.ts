/**
 * Completes customer sign-in.
 *
 * The `state` returned by Shopify must equal the one sealed in this browser's
 * login cookie (CSRF), the code is exchanged with the PKCE verifier, and the ID
 * token's signature, issuer, audience, expiry and nonce are all verified before
 * a session is created. Any failure ends in a signed-out account page.
 */
import { NextResponse, type NextRequest } from 'next/server';

import { config } from '@/server/config';
import { callbackUrl, originFromHeaders } from '@/server/customer/context';
import {
  clearLoginAttemptIn,
  readLoginAttemptFrom,
  writeSessionTo,
  type CookieJar,
} from '@/server/customer/session';
import { safeEqual } from '@/server/security';
import {
  discoverEndpoints,
  exchangeCode,
  safeReturnTo,
  verifyIdToken,
} from '@/server/shopify/customer-account';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const origin = originFromHeaders(request.headers);
  const fail = (reason: string) => {
    const response = NextResponse.redirect(`${origin}/account?error=${reason}`, 303);
    clearLoginAttemptIn(response.cookies as unknown as CookieJar);
    response.headers.set('cache-control', 'no-store');
    return response;
  };

  const clientId = config.shopify.customerAccountClientId;
  if (!clientId) return fail('unavailable');

  const params = request.nextUrl.searchParams;
  const attempt = readLoginAttemptFrom(request.cookies as unknown as CookieJar);
  const state = params.get('state');
  const code = params.get('code');

  if (params.get('error')) return fail('cancelled');
  if (!attempt || !state || !safeEqual(state, attempt.state)) return fail('state');
  if (!code || code.length > 2000) return fail('code');

  try {
    const tokens = await exchangeCode({
      code,
      codeVerifier: attempt.codeVerifier,
      redirectUri: callbackUrl(origin),
      origin,
    });
    if (!tokens.idToken) return fail('token');
    const endpoints = await discoverEndpoints();
    const claims = await verifyIdToken(tokens.idToken, {
      issuer: endpoints.issuer,
      clientId,
      nonce: attempt.nonce,
      jwksUri: endpoints.jwksUri,
    });

    const response = NextResponse.redirect(`${origin}${safeReturnTo(attempt.returnTo)}`, 303);
    const jar = response.cookies as unknown as CookieJar;
    clearLoginAttemptIn(jar);
    if (!writeSessionTo(jar, { ...tokens, subject: claims.sub, signedInAt: Date.now() })) {
      return fail('unavailable');
    }
    response.headers.set('cache-control', 'no-store');
    return response;
  } catch (error) {
    console.error(`[customer-auth] sign-in failed: ${(error as Error).message}`);
    return fail('signin');
  }
}
