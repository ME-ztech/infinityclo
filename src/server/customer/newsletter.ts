/**
 * Newsletter signup and unsubscribe.
 *
 * Consent is the record. Each signup stores the exact wording agreed to, when,
 * and from which form (`records.subscribe`). There is one marketing list: if
 * the address also has a customer account, the account's consent flag is kept
 * in step, so a person never appears subscribed in one place and unsubscribed
 * in the other.
 *
 * Unsubscribe links carry an HMAC of the address, so nobody can unsubscribe
 * (or probe for) an address they were not sent a link for.
 */
import 'server-only';

import { createHmac } from 'node:crypto';

import { eq } from 'drizzle-orm';

import { isDatabaseConfigured } from '../db/client';
import { subscribe, unsubscribe, type Subscriber } from '../records';
import { safeEqual, sessionSecret } from '../security';

/** Mirrors newsletter consent onto a customer account with the same address. */
async function syncAccountConsent(email: string, consent: boolean, source: string): Promise<void> {
  if (!isDatabaseConfigured()) return;
  try {
    const { getDb, schema } = await import('../db/client');
    const db = await getDb();
    await db
      .update(schema.customers)
      .set({
        marketingConsent: consent,
        marketingConsentAt: new Date(),
        marketingConsentSource: source,
        updatedAt: new Date(),
      })
      .where(eq(schema.customers.email, email));
  } catch (error) {
    // The consent record itself is already stored; the mirror is best-effort.
    console.error(`[newsletter] could not mirror consent to the account: ${(error as Error).message}`);
  }
}

export interface SignupResult {
  readonly created: boolean;
  readonly subscriber: Subscriber;
}

export async function signUpForNewsletter(email: string, source: string): Promise<SignupResult> {
  const { subscriber, created } = await subscribe(email, source);
  if (created) await syncAccountConsent(email, true, `newsletter:${source}`.slice(0, 60));
  return { created, subscriber };
}

export async function unsubscribeFromNewsletter(email: string): Promise<{ changed: boolean }> {
  const changed = await unsubscribe(email);
  await syncAccountConsent(email, false, 'unsubscribe-link');
  return { changed };
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
