/** Signs out locally and at Shopify (end_session_endpoint). POST only, same-origin. */
import { NextResponse } from 'next/server';

import { clearCustomerSession, getCustomerSession } from '@/server/auth/customer';
import { contextFromHeaders, isSameOrigin } from '@/server/security/request';
import { logoutUrl } from '@/server/shopify/customer-account';

export async function POST(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const context = contextFromHeaders(request.headers);
  const origin = `${context.isHttps ? 'https' : url.protocol.replace(':', '')}://${context.host ?? url.host}`;
  if (!isSameOrigin(request)) return new Response('Cross-origin request refused.', { status: 403 });
  const session = await getCustomerSession();
  await clearCustomerSession();
  const shopifyLogout = session
    ? await logoutUrl(session.idToken, `${origin}/`).catch(() => null)
    : null;
  return NextResponse.redirect(shopifyLogout ?? new URL('/', origin), 303);
}
