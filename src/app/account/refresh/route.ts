/** Refreshes an expired customer access token (cookies can only be written here, not in a page render). */
import { NextResponse } from 'next/server';

import { clearCustomerSession, getCustomerSession, safeReturnTo, setCustomerSession } from '@/server/auth/customer';
import { contextFromHeaders } from '@/server/security/request';
import { refreshTokens } from '@/server/shopify/customer-account';

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const context = contextFromHeaders(request.headers);
  const origin = `${context.isHttps ? 'https' : url.protocol.replace(':', '')}://${context.host ?? url.host}`;
  const returnTo = safeReturnTo(url.searchParams.get('returnTo'));
  const session = await getCustomerSession();
  if (!session?.refreshToken) {
    await clearCustomerSession();
    return NextResponse.redirect(new URL(`/account/sign-in?returnTo=${encodeURIComponent(returnTo)}`, origin));
  }
  try {
    const tokens = await refreshTokens(session.refreshToken, origin);
    await setCustomerSession({ ...session, ...tokens, refreshToken: tokens.refreshToken ?? session.refreshToken, idToken: tokens.idToken ?? session.idToken }, context.isHttps);
    return NextResponse.redirect(new URL(returnTo, origin));
  } catch {
    await clearCustomerSession();
    return NextResponse.redirect(new URL(`/account/sign-in?returnTo=${encodeURIComponent(returnTo)}`, origin));
  }
}
