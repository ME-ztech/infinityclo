/**
 * Signs the customer out: clears this site's session cookies, then ends the
 * Shopify login session through the provider's end-session endpoint so the
 * next "Sign in" really asks again.
 *
 * POST only, same-origin only — a third-party page cannot sign a customer out.
 */
import { NextResponse, type NextRequest } from 'next/server';

import { originFromHeaders } from '@/server/customer/context';
import { clearSessionIn, readSessionFrom, type CookieJar } from '@/server/customer/session';
import { isSameOrigin } from '@/server/security';
import {
  buildLogoutUrl,
  discoverEndpoints,
  isCustomerAuthConfigured,
} from '@/server/shopify/customer-account';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'Cross-site request refused.' }, { status: 403 });
  }
  const origin = originFromHeaders(request.headers);
  const session = readSessionFrom(request.cookies as unknown as CookieJar);

  let destination = `${origin}/account?signed_out=1`;
  if (session?.idToken && isCustomerAuthConfigured()) {
    const endpoints = await discoverEndpoints();
    destination = buildLogoutUrl(endpoints, session.idToken, `${origin}/account`);
  }
  const response = NextResponse.redirect(destination, 303);
  clearSessionIn(response.cookies as unknown as CookieJar);
  response.headers.set('cache-control', 'no-store');
  return response;
}
