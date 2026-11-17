/**
 * Request-scoped helpers shared by the /account pages and their route handlers.
 */
import 'server-only';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { config } from '../config';
import { CustomerAuthError, isCustomerAuthConfigured } from '../shopify/customer-account';
import { getCustomerGateway, type CustomerAccountGateway } from './gateway';
import { needsRefresh, readSession, type CustomerSession } from './session';

/** `https://host` of the request, honouring the proxy headers the host sets. */
export function originFromHeaders(source: Headers): string {
  const host = source.get('x-forwarded-host') ?? source.get('host') ?? 'localhost:3000';
  const forwarded = source.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  const protocol = forwarded === 'http' || forwarded === 'https' ? forwarded : local ? 'http' : 'https';
  return `${protocol}://${host}`;
}

export const callbackUrl = (origin: string): string => `${origin}/api/auth/customer/callback`;

/** Where "Sign in" goes when no OAuth client is configured: Shopify's own hosted account page. */
export const hostedAccountUrl = (): string => `https://${config.shopify.checkoutDomain}/account`;

export type AccountContext =
  | { readonly state: 'unconfigured' }
  | { readonly state: 'signed_out' }
  | {
      readonly state: 'signed_in';
      readonly session: CustomerSession;
      readonly gateway: CustomerAccountGateway;
      readonly origin: string;
    };

/**
 * Resolves who is looking at an account page. When the access token is about
 * to lapse the request is bounced through the refresh route, because a server
 * component cannot write the renewed cookie itself.
 */
export async function accountContext(returnTo: string): Promise<AccountContext> {
  if (!isCustomerAuthConfigured()) return { state: 'unconfigured' };
  const session = await readSession();
  if (!session) return { state: 'signed_out' };
  if (needsRefresh(session)) redirect(`/api/auth/customer/refresh?returnTo=${encodeURIComponent(returnTo)}`);
  const origin = originFromHeaders(await headers());
  return { state: 'signed_in', session, gateway: getCustomerGateway(origin), origin };
}

/**
 * Runs a gateway read for a page. A session Shopify no longer accepts is sent
 * through the refresh route (which signs the customer out if it cannot renew);
 * any other failure is returned so the page can say the data is unavailable
 * instead of crashing or showing something stale.
 */
export async function loadForPage<T>(returnTo: string, load: () => Promise<T>): Promise<{ data: T } | { error: string }> {
  try {
    return { data: await load() };
  } catch (error) {
    if (error instanceof CustomerAuthError && error.code === 'unauthorized') {
      redirect(`/api/auth/customer/refresh?returnTo=${encodeURIComponent(returnTo)}`);
    }
    // `redirect()` and `notFound()` signal by throwing; let them through.
    if (typeof (error as { digest?: unknown })?.digest === 'string') throw error;
    console.error(`[account] ${returnTo} failed: ${(error as Error).message}`);
    return { error: 'Your account details could not be loaded right now. Please try again in a moment.' };
  }
}
