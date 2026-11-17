/**
 * Newsletter signup and unsubscribe.
 *
 * Consent is the record. Each signup stores the exact wording agreed to, when,
 * and from which form (`records.subscribe`). When the Shopify Admin API is
 * connected the same consent is written to the Shopify customer, so Shopify
 * stays the one marketing list and nothing is ever sent from two systems.
 *
 * The Shopify write is best-effort *after* the local record exists: if Shopify
 * is unreachable the consent is not lost, it is simply left unsynced
 * (`syncedToShopifyAt: null`) for the admin to see and retry.
 *
 * Unsubscribe links carry an HMAC of the address, so nobody can unsubscribe
 * (or probe for) an address they were not sent a link for.
 */
import 'server-only';

import { createHmac } from 'node:crypto';

import { subscribe, unsubscribe, type Subscriber } from '../records';
import { maskEmail, safeEqual, sessionSecret } from '../security';
import { adminQuery, assertNoUserErrors, isAdminConfigured, type UserError } from '../shopify/client';
import { getStore } from '../store';

type MarketingState = 'SUBSCRIBED' | 'UNSUBSCRIBED';

const FIND_CUSTOMER = /* GraphQL */ `
  query FindCustomerByEmail($query: String!) {
    customers(first: 1, query: $query) { nodes { id } }
  }
`;

const UPDATE_CONSENT = /* GraphQL */ `
  mutation UpdateEmailConsent($input: CustomerEmailMarketingConsentUpdateInput!) {
    customerEmailMarketingConsentUpdate(input: $input) {
      customer { id }
      userErrors { field message }
    }
  }
`;

const CREATE_CUSTOMER = /* GraphQL */ `
  mutation CreateSubscriber($input: CustomerInput!) {
    customerCreate(input: $input) {
      customer { id }
      userErrors { field message }
    }
  }
`;

/**
 * Writes email-marketing consent to the Shopify customer with this address,
 * creating the customer when subscribing and none exists. Unsubscribing an
 * address Shopify has never seen is a no-op.
 */
export async function syncConsentToShopify(
  email: string,
  state: MarketingState,
  at: string,
  fetcher?: typeof fetch,
): Promise<void> {
  const options = fetcher ? { fetcher, maxAttempts: 2 } : { maxAttempts: 2 };
  const consent = {
    marketingState: state,
    consentUpdatedAt: at,
    ...(state === 'SUBSCRIBED' ? { marketingOptInLevel: 'SINGLE_OPT_IN' } : {}),
  };
  const found = await adminQuery<{ customers: { nodes: Array<{ id: string }> } }>(FIND_CUSTOMER, {
    ...options,
    variables: { query: `email:"${email.replace(/["\\]/g, '')}"` },
  });
  const customerId = found.customers.nodes[0]?.id;

  if (customerId) {
    const data = await adminQuery<{ customerEmailMarketingConsentUpdate: { userErrors: UserError[] } }>(UPDATE_CONSENT, {
      ...options,
      variables: { input: { customerId, emailMarketingConsent: consent } },
    });
    assertNoUserErrors(data.customerEmailMarketingConsentUpdate.userErrors);
    return;
  }
  if (state === 'UNSUBSCRIBED') return;

  const data = await adminQuery<{ customerCreate: { userErrors: UserError[] } }>(CREATE_CUSTOMER, {
    ...options,
    variables: { input: { email, emailMarketingConsent: consent } },
  });
  assertNoUserErrors(data.customerCreate.userErrors);
}

export interface SignupResult {
  readonly created: boolean;
  readonly subscriber: Subscriber;
  /** `skipped` when Shopify is not connected; `failed` when it is but the write did not land. */
  readonly shopify: 'synced' | 'skipped' | 'failed';
}

export async function signUpForNewsletter(email: string, source: string, fetcher?: typeof fetch): Promise<SignupResult> {
  const { subscriber, created } = await subscribe(email, source);
  if (!isAdminConfigured() || subscriber.syncedToShopifyAt) {
    return { created, subscriber, shopify: subscriber.syncedToShopifyAt ? 'synced' : 'skipped' };
  }
  try {
    await syncConsentToShopify(email, 'SUBSCRIBED', subscriber.subscribedAt, fetcher);
    const synced = { ...subscriber, syncedToShopifyAt: new Date().toISOString() };
    await getStore().put('subscribers', synced.id, synced);
    return { created, subscriber: synced, shopify: 'synced' };
  } catch (error) {
    console.error(`[newsletter] Shopify consent sync failed for ${maskEmail(email)}: ${(error as Error).message}`);
    return { created, subscriber, shopify: 'failed' };
  }
}

export async function unsubscribeFromNewsletter(email: string, fetcher?: typeof fetch): Promise<{ changed: boolean; shopify: SignupResult['shopify'] }> {
  const changed = await unsubscribe(email);
  if (!isAdminConfigured()) return { changed, shopify: 'skipped' };
  try {
    await syncConsentToShopify(email, 'UNSUBSCRIBED', new Date().toISOString(), fetcher);
    return { changed, shopify: 'synced' };
  } catch (error) {
    console.error(`[newsletter] Shopify unsubscribe sync failed for ${maskEmail(email)}: ${(error as Error).message}`);
    return { changed, shopify: 'failed' };
  }
}

/* ------------------------------------------------------------------ *
 * Unsubscribe tokens
 * ------------------------------------------------------------------ */

/** Null when no session secret is available, in which case links cannot be issued. */
export function unsubscribeToken(email: string): string | null {
  const secret = sessionSecret();
  if (!secret) return null;
  return createHmac('sha256', secret).update(`newsletter-unsubscribe:${email}`).digest('base64url');
}

export function isValidUnsubscribeToken(email: string, token: string | null | undefined): boolean {
  const expected = unsubscribeToken(email);
  return Boolean(expected && token && safeEqual(expected, token));
}

/** Path for an unsubscribe link; prefix with the site origin when emailing it. */
export function unsubscribePath(email: string): string | null {
  const token = unsubscribeToken(email);
  return token ? `/account/unsubscribe?email=${encodeURIComponent(email)}&token=${token}` : null;
}
