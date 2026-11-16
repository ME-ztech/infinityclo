/**
 * Operational records the storefront collects and the admin reviews:
 * newsletter consent, drop waitlists, drops, community submissions, contact
 * tickets and return requests.
 *
 * Marketing consent is recorded explicitly — what was agreed to, when, from
 * which form — and is never inferred from an account or an order (CASL).
 */
import 'server-only';

import { getStore, newId } from './store';
import { stableHash } from './security';

/* ------------------------------------------------------------------ *
 * Newsletter subscribers
 * ------------------------------------------------------------------ */

export interface Subscriber {
  readonly id: string;
  readonly email: string;
  readonly status: 'subscribed' | 'unsubscribed';
  /** The exact consent wording the person agreed to. */
  readonly consentText: string;
  readonly source: string;
  readonly subscribedAt: string;
  readonly unsubscribedAt: string | null;
  /** Set once the consent has been written to the Shopify customer record. */
  readonly syncedToShopifyAt: string | null;
}

export const NEWSLETTER_CONSENT_TEXT =
  'I agree to receive marketing emails from INFNITY about drops and offers. I can unsubscribe at any time.';

const subscriberId = (email: string) => `sub_${stableHash(email)}`;

/** Idempotent: a second signup for the same address is reported, not duplicated. */
export async function subscribe(email: string, source: string): Promise<{ subscriber: Subscriber; created: boolean }> {
  const store = getStore();
  const id = subscriberId(email);
  const record: Subscriber = {
    id,
    email,
    status: 'subscribed',
    consentText: NEWSLETTER_CONSENT_TEXT,
    source: source.slice(0, 60),
    subscribedAt: new Date().toISOString(),
    unsubscribedAt: null,
    syncedToShopifyAt: null,
  };
  if (await store.putIfAbsent('subscribers', id, record)) return { subscriber: record, created: true };
  const existing = (await store.get<Subscriber>('subscribers', id))!;
  if (existing.status === 'unsubscribed') {
    // Re-subscribing is a fresh consent event.
    await store.put('subscribers', id, record);
    return { subscriber: record, created: true };
  }
  return { subscriber: existing, created: false };
}

export async function unsubscribe(email: string): Promise<boolean> {
  const store = getStore();
  const existing = await store.get<Subscriber>('subscribers', subscriberId(email));
  if (!existing || existing.status === 'unsubscribed') return false;
  await store.put('subscribers', existing.id, { ...existing, status: 'unsubscribed', unsubscribedAt: new Date().toISOString() });
  return true;
}

export const listSubscribers = async (): Promise<Subscriber[]> =>
  (await getStore().list<Subscriber>('subscribers')).sort((a, b) => b.subscribedAt.localeCompare(a.subscribedAt));

/* ------------------------------------------------------------------ *
 * Drops and waitlists
 * ------------------------------------------------------------------ */

export const DROP_STAGES = ['draft', 'coming_soon', 'early_access', 'published', 'sold_out', 'archived'] as const;
export type DropStage = (typeof DROP_STAGES)[number];

/** Allowed lifecycle moves. Anything else is refused. */
export const DROP_TRANSITIONS: Readonly<Record<DropStage, readonly DropStage[]>> = {
  draft: ['coming_soon', 'published', 'archived'],
  coming_soon: ['draft', 'early_access', 'published', 'archived'],
  early_access: ['coming_soon', 'published', 'archived'],
  published: ['sold_out', 'archived'],
  sold_out: ['published', 'archived'],
  archived: ['draft'],
};

/**
 * A drop is the editorial wrapper around an upcoming product. Every descriptive
 * field is optional: the teaser shows only what the owner has confirmed, and a
 * countdown appears only when `releaseConfirmed` is true.
 */
export interface Drop {
  readonly id: string;
  readonly stage: DropStage;
  /** Internal working name. Never shown to customers. */
  readonly internalName: string;
  /** Public name, once the owner is ready to reveal it. */
  readonly publicName: string | null;
  readonly teaser: string | null;
  readonly image: { readonly url: string; readonly alt: string; readonly width: number; readonly height: number } | null;
  readonly releaseAt: string | null;
  readonly releaseConfirmed: boolean;
  /** Shopify handle of the product, once it exists there. */
  readonly productSlug: string | null;
  readonly waitlistEnabled: boolean;
  readonly previewToken: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly updatedBy: string;
}

export const listDrops = async (): Promise<Drop[]> =>
  (await getStore().list<Drop>('drops')).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

export const getDrop = (id: string): Promise<Drop | null> => getStore().get<Drop>('drops', id);

export const saveDrop = async (drop: Drop): Promise<Drop> => {
  await getStore().put('drops', drop.id, drop);
  return drop;
};

export const deleteDrop = (id: string): Promise<void> => getStore().delete('drops', id);

export function newDrop(internalName: string, actor: string): Drop {
  const now = new Date().toISOString();
  return {
    id: newId('drop'),
    stage: 'draft',
    internalName: internalName.slice(0, 80),
    publicName: null,
    teaser: null,
    image: null,
    releaseAt: null,
    releaseConfirmed: false,
    productSlug: null,
    waitlistEnabled: true,
    previewToken: crypto.randomUUID().replace(/-/g, ''),
    createdAt: now,
    updatedAt: now,
    updatedBy: actor,
  };
}

/** Drops the public homepage may tease. */
export async function listPublicDrops(): Promise<Drop[]> {
  try {
    return (await listDrops()).filter((drop) => drop.stage === 'coming_soon' || drop.stage === 'early_access');
  } catch {
    return [];
  }
}

export interface WaitlistEntry {
  readonly id: string;
  readonly dropId: string;
  readonly email: string;
  readonly consentText: string;
  readonly joinedAt: string;
}

export const WAITLIST_CONSENT_TEXT =
  'Email me when this drop is available. I can ask to be removed at any time.';

/** One entry per address per drop; a repeat signup resolves `created: false`. */
export async function joinWaitlist(dropId: string, email: string): Promise<{ created: boolean }> {
  const id = `wl_${stableHash(`${dropId}:${email}`)}`;
  const created = await getStore().putIfAbsent<WaitlistEntry>('waitlist', id, {
    id,
    dropId,
    email,
    consentText: WAITLIST_CONSENT_TEXT,
    joinedAt: new Date().toISOString(),
  });
  return { created };
}

export const listWaitlist = async (dropId?: string): Promise<WaitlistEntry[]> =>
  (await getStore().list<WaitlistEntry>('waitlist'))
    .filter((entry) => !dropId || entry.dropId === dropId)
    .sort((a, b) => b.joinedAt.localeCompare(a.joinedAt));

/* ------------------------------------------------------------------ *
 * Community submissions
 * ------------------------------------------------------------------ */

export interface CommunitySubmission {
  readonly id: string;
  readonly status: 'pending' | 'approved' | 'hidden';
  readonly image: { readonly url: string; readonly width: number; readonly height: number };
  /** Public credit, with leading @. Shown only when `creditPublicly` is true. */
  readonly handle: string | null;
  readonly creditPublicly: boolean;
  readonly caption: string | null;
  readonly productSlugs: readonly string[];
  /**
   * Where permission comes from. `legacy_wall` entries were already published by
   * the brand on infinityclo.ca; `submission` entries carry the uploader's own
   * recorded consent; `owner_confirmed` is set by staff after checking.
   */
  readonly rights: 'legacy_wall' | 'submission' | 'owner_confirmed';
  readonly consentText: string | null;
  readonly submitterEmail: string | null;
  readonly submittedAt: string;
  readonly reviewedAt: string | null;
  readonly reviewedBy: string | null;
}

export const COMMUNITY_CONSENT_TEXT =
  'This is my photo, or I have permission to share it. INFNITY may display it on infinityclo.ca and its social channels, and I can ask for it to be removed at any time.';

export const listSubmissions = async (): Promise<CommunitySubmission[]> =>
  (await getStore().list<CommunitySubmission>('community')).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

export const getSubmission = (id: string) => getStore().get<CommunitySubmission>('community', id);

export const saveSubmission = async (submission: CommunitySubmission): Promise<CommunitySubmission> => {
  await getStore().put('community', submission.id, submission);
  return submission;
};

/** Ids of legacy wall entries staff have hidden. The wall itself ships in the repo. */
export async function hiddenLegacyWallIds(): Promise<Set<string>> {
  try {
    const hidden = await getStore().get<{ ids: string[] }>('content', 'community-hidden');
    return new Set(hidden?.ids ?? []);
  } catch {
    return new Set();
  }
}

export async function setLegacyWallHidden(id: string, hidden: boolean): Promise<void> {
  const ids = await hiddenLegacyWallIds();
  if (hidden) ids.add(id);
  else ids.delete(id);
  await getStore().put('content', 'community-hidden', { ids: [...ids] });
}

/* ------------------------------------------------------------------ *
 * Contact tickets and return requests
 * ------------------------------------------------------------------ */

export const TICKET_TOPICS = ['order', 'return', 'sizing', 'wholesale', 'other'] as const;
export type TicketTopic = (typeof TICKET_TOPICS)[number];

export interface Ticket {
  readonly id: string;
  readonly status: 'open' | 'in_progress' | 'closed';
  readonly topic: TicketTopic;
  readonly name: string;
  readonly email: string;
  readonly phone: string | null;
  readonly orderNumber: string | null;
  readonly message: string;
  /** Signed-in customer id when the request came from /account. */
  readonly customerId: string | null;
  readonly emailed: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly notes: ReadonlyArray<{ readonly at: string; readonly by: string; readonly text: string }>;
}

export async function createTicket(
  input: Pick<Ticket, 'topic' | 'name' | 'email' | 'phone' | 'orderNumber' | 'message' | 'customerId'>,
): Promise<Ticket> {
  const now = new Date().toISOString();
  const ticket: Ticket = { ...input, id: newId('tkt'), status: 'open', emailed: false, createdAt: now, updatedAt: now, notes: [] };
  await getStore().put('tickets', ticket.id, ticket);
  return ticket;
}

export const listTickets = async (): Promise<Ticket[]> =>
  (await getStore().list<Ticket>('tickets')).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export const getTicket = (id: string) => getStore().get<Ticket>('tickets', id);

export const saveTicket = async (ticket: Ticket): Promise<Ticket> => {
  const next = { ...ticket, updatedAt: new Date().toISOString() };
  await getStore().put('tickets', ticket.id, next);
  return next;
};
