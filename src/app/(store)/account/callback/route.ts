/** OAuth callback: checks state, exchanges the code with the PKCE verifier, validates the ID token and seals the session. */
import { NextResponse } from 'next/server';

import { setCustomerSession, takeOAuthState } from '@/server/auth/customer';
import { contextFromHeaders } from '@/server/security/request';
import { shopifyConfig } from '@/server/shopify/config';
import { exchangeCode, validateIdTokenClaims } from '@/server/shopify/customer-account';

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const context = contextFromHeaders(request.headers);
  const origin = `${context.isHttps ? 'https' : url.protocol.replace(':', '')}://${context.host ?? url.host}`;
  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/account?error=${reason}`, origin));

  const saved = await takeOAuthState();
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (url.searchParams.get('error')) return fail('signin_cancelled');
  if (!saved || !code || !state || state !== saved.state) return fail('signin_state');

  try {
    const tokens = await exchangeCode({
      code,
      redirectUri: `${origin}/account/callback`,
      verifier: saved.verifier,
      origin,
    });
    const { email } = tokens.idToken
      ? validateIdTokenClaims(tokens.idToken, {
          nonce: saved.nonce,
          clientId: shopifyConfig().customerAccountClientId ?? '',
        })
      : { email: null };
    await setCustomerSession({ ...tokens, email }, context.isHttps);
    return NextResponse.redirect(new URL(saved.returnTo, origin));
  } catch (error) {
    console.error(`[account] callback failed: ${(error as Error).message}`);
    return fail('signin_failed');
  }
}
