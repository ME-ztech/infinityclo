/**
 * Application database schema.
 *
 * This database holds ONLY what Shopify does not model. Products, inventory,
 * customers, orders, payments and live discounts live in Shopify and are never
 * mirrored here as a second source of truth (see docs/architecture-decision.md).
 */
import {
  bigserial,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer; driverData: Buffer | Uint8Array }>({
  dataType: () => 'bytea',
  fromDriver: (value) => (Buffer.isBuffer(value) ? value : Buffer.from(value)),
});

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

/* ------------------------------------------------------------------ *
 * Staff, sessions, audit
 * ------------------------------------------------------------------ */

export const staffUsers = pgTable('staff_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  role: text('role').notNull(),
  passwordHash: text('password_hash').notNull(),
  active: boolean('active').notNull().default(true),
  failedLoginCount: integer('failed_login_count').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const staffSessions = pgTable(
  'staff_sessions',
  {
    /** SHA-256 of the session token. The token itself is only ever in the cookie. */
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => staffUsers.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ipHash: text('ip_hash'),
    userAgent: text('user_agent'),
  },
  (t) => [index('staff_sessions_user_idx').on(t.userId)],
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    actorId: uuid('actor_id'),
    actorEmail: text('actor_email'),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    summary: text('summary').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    ipHash: text('ip_hash'),
  },
  (t) => [
    index('audit_log_at_idx').on(t.at),
    index('audit_log_target_idx').on(t.targetType, t.targetId),
  ],
);

/* ------------------------------------------------------------------ *
 * Settings and CMS
 * ------------------------------------------------------------------ */

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: updatedAt(),
  updatedBy: text('updated_by'),
});

/** Versioned JSON documents validated by the zod schemas in src/domain/cms.ts. */
export const cmsDocuments = pgTable('cms_documents', {
  key: text('key').primaryKey(),
  data: jsonb('data').notNull(),
  version: integer('version').notNull().default(1),
  updatedAt: updatedAt(),
  updatedBy: text('updated_by'),
});

/* ------------------------------------------------------------------ *
 * Promotions (drafts; live discounts are Shopify's)
 * ------------------------------------------------------------------ */

export const promotions = pgTable('promotions', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  kind: text('kind').notNull(),
  status: text('status').notNull().default('draft'),
  config: jsonb('config').notNull(),
  marginAcknowledged: boolean('margin_acknowledged').notNull().default(false),
  approvedBy: text('approved_by'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  shopifyDiscountId: text('shopify_discount_id'),
  shopifySyncedAt: timestamp('shopify_synced_at', { withTimezone: true }),
  shopifySyncError: text('shopify_sync_error'),
  createdBy: text('created_by'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/* ------------------------------------------------------------------ *
 * Drops and waitlists
 * ------------------------------------------------------------------ */

export const drops = pgTable('drops', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  status: text('status').notNull().default('draft'),
  headline: text('headline'),
  body: text('body'),
  mediaUrl: text('media_url'),
  mediaAlt: text('media_alt'),
  /** Only rendered as a countdown when `releaseConfirmed` is true. */
  releaseAt: timestamp('release_at', { withTimezone: true }),
  releaseConfirmed: boolean('release_confirmed').notNull().default(false),
  shopifyProductHandle: text('shopify_product_handle'),
  waitlistEnabled: boolean('waitlist_enabled').notNull().default(true),
  position: integer('position').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const waitlistEntries = pgTable(
  'waitlist_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dropId: uuid('drop_id')
      .notNull()
      .references(() => drops.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    consentText: text('consent_text').notNull(),
    consentAt: timestamp('consent_at', { withTimezone: true }).notNull().defaultNow(),
    ipHash: text('ip_hash'),
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('waitlist_drop_email_uq').on(t.dropId, t.email)],
);

/* ------------------------------------------------------------------ *
 * Newsletter consent
 * ------------------------------------------------------------------ */

export const subscribers = pgTable('subscribers', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  /** pending -> subscribed (double opt-in) -> unsubscribed */
  status: text('status').notNull().default('pending'),
  source: text('source').notNull(),
  consentText: text('consent_text').notNull(),
  consentAt: timestamp('consent_at', { withTimezone: true }).notNull().defaultNow(),
  confirmTokenHash: text('confirm_token_hash'),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  unsubscribeTokenHash: text('unsubscribe_token_hash'),
  unsubscribedAt: timestamp('unsubscribed_at', { withTimezone: true }),
  groups: jsonb('groups').$type<string[]>().notNull().default([]),
  ipHash: text('ip_hash'),
  shopifySyncStatus: text('shopify_sync_status'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/* ------------------------------------------------------------------ *
 * Community (Styled By You / The Troop)
 * ------------------------------------------------------------------ */

export const communityPosts = pgTable(
  'community_posts',
  {
    id: text('id').primaryKey(),
    source: text('source').notNull(),
    status: text('status').notNull().default('pending'),
    imageUrl: text('image_url'),
    imageData: bytea('image_data'),
    imageMime: text('image_mime'),
    alt: text('alt').notNull().default(''),
    handle: text('handle'),
    caption: text('caption'),
    productSlugs: jsonb('product_slugs').$type<string[]>().notNull().default([]),
    /** documented | implied_legacy | none */
    consentStatus: text('consent_status').notNull().default('none'),
    consentText: text('consent_text'),
    consentAt: timestamp('consent_at', { withTimezone: true }),
    submitterEmail: text('submitter_email'),
    instagramUrl: text('instagram_url'),
    moderatedBy: text('moderated_by'),
    moderatedAt: timestamp('moderated_at', { withTimezone: true }),
    moderationNote: text('moderation_note'),
    position: integer('position').notNull().default(0),
    ipHash: text('ip_hash'),
    createdAt: createdAt(),
  },
  (t) => [index('community_status_idx').on(t.status, t.position)],
);

/* ------------------------------------------------------------------ *
 * Inbox: contact, order help, returns
 * ------------------------------------------------------------------ */

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').notNull(),
    status: text('status').notNull().default('new'),
    name: text('name').notNull(),
    email: text('email').notNull(),
    orderNumber: text('order_number'),
    subject: text('subject'),
    body: text('body').notNull(),
    shopifyCustomerId: text('shopify_customer_id'),
    notes: jsonb('notes')
      .$type<Array<{ at: string; by: string; text: string }>>()
      .notNull()
      .default([]),
    ipHash: text('ip_hash'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('messages_status_idx').on(t.status, t.createdAt)],
);

/* ------------------------------------------------------------------ *
 * Infrastructure
 * ------------------------------------------------------------------ */

/** Shopify webhook ledger. Primary key on X-Shopify-Webhook-Id makes delivery idempotent. */
export const webhookEvents = pgTable('webhook_events', {
  webhookId: text('webhook_id').primaryKey(),
  eventId: text('event_id'),
  topic: text('topic').notNull(),
  shopDomain: text('shop_domain'),
  resourceId: text('resource_id'),
  status: text('status').notNull().default('received'),
  attempts: integer('attempts').notNull().default(1),
  error: text('error'),
  payloadDigest: text('payload_digest'),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
});

export const rateLimits = pgTable('rate_limits', {
  key: text('key').primaryKey(),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
  count: integer('count').notNull().default(0),
});

export const outboundEmails = pgTable('outbound_emails', {
  id: uuid('id').primaryKey().defaultRandom(),
  to: text('to').notNull(),
  subject: text('subject').notNull(),
  template: text('template').notNull(),
  /** sent | failed | not_sent_no_provider */
  status: text('status').notNull(),
  providerId: text('provider_id'),
  error: text('error'),
  createdAt: createdAt(),
});
