import 'server-only';

import { NEWSLETTER_CONSENT_TEXT } from '@/domain/consent';

import { desc, eq } from 'drizzle-orm';

import { getSettings } from '@/server/content/cms';
import { getDb } from '@/server/db/client';
import { subscribers } from '@/server/db/schema';
import { isEmailConfigured, sendEmail } from '@/server/email';
import { randomToken, sha256Hex } from '@/server/security/crypto';
import { isAdminConfigured } from '@/server/shopify/config';
import { syncEmailConsent } from '@/server/shopify/admin';

/**
 * Newsletter consent, designed for Canada's anti-spam law (CASL): express,
 * unbundled consent from an unticked checkbox, with the exact wording, time,
 * source and a hashed IP recorded as evidence. Creating a customer account never
 * implies consent; this is the only path in.
 */

export type SubscribeOutcome = 'subscribed' | 'pending_confirmation' | 'already_subscribed';

export async function subscribe(input: {
  email: string;
  source: string;
  consentText: string;
  ipHash: string | null;
  origin: string;
  groups?: string[];
}): Promise<SubscribeOutcome> {
  const email = input.email.trim().toLowerCase();
  const db = await getDb();
  const settings = await getSettings();
  const doubleOptIn = settings.newsletterDoubleOptIn && isEmailConfigured();

  const [existing] = await db.select().from(subscribers).where(eq(subscribers.email, email)).limit(1);
  if (existing?.status === 'subscribed') return 'already_subscribed';

  const confirmToken = randomToken(24);
  const unsubscribeToken = randomToken(24);
  const values = {
    status: doubleOptIn ? 'pending' : 'subscribed',
    source: input.source,
    consentText: input.consentText,
    consentAt: new Date(),
    confirmTokenHash: doubleOptIn ? sha256Hex(confirmToken) : null,
    confirmedAt: doubleOptIn ? null : new Date(),
    unsubscribeTokenHash: sha256Hex(unsubscribeToken),
    unsubscribedAt: null,
    groups: input.groups ?? existing?.groups ?? [],
    ipHash: input.ipHash,
    updatedAt: new Date(),
  };

  if (existing) {
    await db.update(subscribers).set(values).where(eq(subscribers.id, existing.id));
  } else {
    await db.insert(subscribers).values({ email, ...values });
  }

  if (doubleOptIn) {
    const link = `${input.origin}/newsletter/confirm?token=${confirmToken}`;
    await sendEmail({
      to: email,
      subject: 'Confirm your INFNITY early access',
      template: 'newsletter-confirm',
      text: `Tap to confirm you want emails about INFNITY drops and restocks:\n\n${link}\n\nIf this wasn't you, ignore this email and you won't hear from us.`,
    });
    return 'pending_confirmation';
  }

  await mirrorToShopify(email, true);
  return 'subscribed';
}

export async function confirm(token: string): Promise<boolean> {
  const db = await getDb();
  const [row] = await db.select().from(subscribers).where(eq(subscribers.confirmTokenHash, sha256Hex(token))).limit(1);
  if (!row || row.status === 'unsubscribed') return false;
  await db
    .update(subscribers)
    .set({ status: 'subscribed', confirmedAt: new Date(), confirmTokenHash: null, updatedAt: new Date() })
    .where(eq(subscribers.id, row.id));
  await mirrorToShopify(row.email, true);
  return true;
}

export async function unsubscribeByToken(token: string): Promise<boolean> {
  const db = await getDb();
  const [row] = await db.select().from(subscribers).where(eq(subscribers.unsubscribeTokenHash, sha256Hex(token))).limit(1);
  if (!row) return false;
  await db
    .update(subscribers)
    .set({ status: 'unsubscribed', unsubscribedAt: new Date(), updatedAt: new Date() })
    .where(eq(subscribers.id, row.id));
  await mirrorToShopify(row.email, false);
  return true;
}

async function mirrorToShopify(email: string, subscribed: boolean): Promise<void> {
  if (!isAdminConfigured()) return;
  const db = await getDb();
  try {
    const result = await syncEmailConsent(email, subscribed);
    await db.update(subscribers).set({ shopifySyncStatus: `synced:${result}` }).where(eq(subscribers.email, email));
  } catch (error) {
    await db
      .update(subscribers)
      .set({ shopifySyncStatus: `failed:${(error as Error).message.slice(0, 120)}` })
      .where(eq(subscribers.email, email));
  }
}

export async function listSubscribers(limit = 500) {
  const db = await getDb();
  return db.select().from(subscribers).orderBy(desc(subscribers.createdAt)).limit(limit);
}

export { NEWSLETTER_CONSENT_TEXT };
