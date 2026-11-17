/**
 * Renews a customer session that is about to lapse.
 *
 * Server components cannot set cookies, so account pages bounce through this
 * route when the access token is nearly expired or Shopify has rejected it.
 * If the session cannot be renewed the customer is signed out here — never left
 * looking at account data under a dead session.
 */
import { NextResponse, type NextRequest } from 'next/server';

import { originFromHeaders } from '@/server/customer/context';
import {
  clearSessionIn,
  readSessionFrom,
  writeSessionTo,
  type CookieJar,
} from '@/server/customer/session';
import { refreshTokens, safeReturnTo } from '@/server/shopify/customer-account';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const origin = originFromHeaders(request.headers);
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get('returnTo'));
  const session = readSessionFrom(request.cookies as unknown as CookieJar);

  const signedOut = () => {
    const response = NextResponse.redirect(`${origin}/account?error=expired`, 303);
    clearSessionIn(response.cookies as unknown as CookieJar);
    response.headers.set('cache-control', 'no-store');
    return response;
  };

  if (!session) return signedOut();
  try {
    const tokens = await refreshTokens(session, origin);
    const response = NextResponse.redirect(`${origin}${returnTo}`, 303);
    if (!writeSessionTo(response.cookies as unknown as CookieJar, { ...session, ...tokens })) {
      return signedOut();
    }
    response.headers.set('cache-control', 'no-store');
    return response;
  } catch {
    // App clients receive no refresh token; they simply sign in again.
    return signedOut();
  }
}
