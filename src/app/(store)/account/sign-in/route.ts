/**
 * Starts Shopify Customer Account sign-in (OAuth 2.0 + PKCE). Passwordless:
 * Shopify emails a one-time code. Without the Customer Account API configured,
 * sends the customer to Shopify's hosted account pages, where order history
 * already works.
 */
import { NextResponse } from 'next/server';

import { safeReturnTo, setOAuthState } from '@/server/auth/customer';
import { randomToken } from '@/server/security/crypto';
import { contextFromHeaders } from '@/server/security/request';
import { isCustomerAccountConfigured, shopifyConfig } from '@/server/shopify/config';
import { authorizationUrl } from '@/server/shopify/customer-account';

export async function GET(request: Request): Promise<Response> {
  if (!isCustomerAccountConfigured())
    return NextResponse.redirect(shopifyConfig().hostedAccountUrl);
  const url = new URL(request.url);
  const context = contextFromHeaders(request.headers);
  const origin = `${context.isHttps ? 'https' : url.protocol.replace(':', '')}://${context.host ?? url.host}`;
  const state = randomToken(24);
  const nonce = randomToken(24);
  const verifier = randomToken(48);
  await setOAuthState(
    {
      state,
      nonce,
      verifier,
      returnTo: safeReturnTo(url.searchParams.get('returnTo')),
      createdAt: Date.now(),
    },
    context.isHttps,
  );
  try {
    return NextResponse.redirect(
      await authorizationUrl({ redirectUri: `${origin}/account/callback`, state, nonce, verifier }),
    );
  } catch (error) {
    console.error(`[account] sign-in failed to start: ${(error as Error).message}`);
    return NextResponse.redirect(new URL('/account?error=signin_unavailable', origin));
  }
}
