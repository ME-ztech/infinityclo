/**
 * Starts customer sign-in.
 *
 * Generates the PKCE verifier, `state` and `nonce`, seals them in a short-lived
 * httpOnly cookie, and sends the browser to Shopify's hosted login. No
 * credential is ever collected on this site.
 */
import { NextResponse } from 'next/server';

import { config } from '@/server/config';
import { callbackUrl, hostedAccountUrl, originFromHeaders } from '@/server/customer/context';
import { writeLoginAttemptTo, type CookieJar } from '@/server/customer/session';
import { clientAddress, rateLimit } from '@/server/security';
import {
  buildAuthorizationUrl,
  createLoginAttempt,
  discoverEndpoints,
} from '@/server/shopify/customer-account';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const origin = originFromHeaders(request.headers);
  const clientId = config.shopify.customerAccountClientId;
  // Without an OAuth client the store's own Shopify-hosted account page is the
  // only real sign-in there is, so that is where the customer is sent.
  if (!clientId) return NextResponse.redirect(hostedAccountUrl(), 303);

  const limit = rateLimit('customer-login', clientAddress(request), 20, 60);
  if (!limit.allowed) return NextResponse.redirect(`${origin}/account?error=rate_limited`, 303);

  const attempt = createLoginAttempt(new URL(request.url).searchParams.get('returnTo') ?? '/account');
  const endpoints = await discoverEndpoints();
  const response = NextResponse.redirect(
    buildAuthorizationUrl(endpoints, attempt, callbackUrl(origin), clientId),
    303,
  );
  if (!writeLoginAttemptTo(response.cookies as unknown as CookieJar, attempt)) {
    // No session secret: refusing is the only safe answer.
    return NextResponse.redirect(`${origin}/account?error=unavailable`, 303);
  }
  response.headers.set('cache-control', 'no-store');
  return response;
}
