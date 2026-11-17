import 'server-only';

import { COMMUNITY_CONSENT_TEXT } from '@/domain/consent';

import { asc, desc, eq, inArray } from 'drizzle-orm';

import legacyWall from '@/data/catalog/community-legacy.json';
import { audit, type AuditActor } from '@/server/audit';
import { getDb } from '@/server/db/client';
import { communityPosts } from '@/server/db/schema';
import { randomToken } from '@/server/security/crypto';

/**
 * Styled By You / The Troop.
 *
 * Statuses: pending → approved | hidden | rejected. Only `approved` posts are
 * public. Customer uploads are verified by magic bytes, size-limited, and
 * re-encoded (which strips EXIF, including GPS location) before storage; they
 * are only served after a moderator approves them.
 *
 * The 34 images already on the legacy "THE TROOP IN INFNITY" wall are imported
 * as approved — matching what the owner publishes today — with consent recorded
 * as `implied_legacy` (tag-to-feature), flagged for the owner to confirm.
 */

export const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;

export function sniffImageType(
  bytes: Uint8Array,
): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'image/jpeg';
  if (
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)
  )
    return 'image/png';
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/** Re-encodes to WebP ≤1600px, auto-rotated, with all metadata removed. */
export async function sanitiseImage(bytes: Uint8Array): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  return sharp(bytes, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
}

let seeded: Promise<void> | null = null;

/** Imports the legacy wall once per database. */
export function ensureCommunitySeed(): Promise<void> {
  seeded ??= (async () => {
    const db = await getDb();
    const existing = await db
      .select({ id: communityPosts.id })
      .from(communityPosts)
      .where(eq(communityPosts.source, 'legacy_wall'))
      .limit(1);
    if (existing.length) return;
    const entries = legacyWall as Array<{ id: string; imageUrl: string; position: number }>;
    if (entries.length === 0) return;
    await db
      .insert(communityPosts)
      .values(
        entries.map((entry) => ({
          id: entry.id,
          source: 'legacy_wall',
          status: 'approved',
          imageUrl: entry.imageUrl,
          alt: 'Customer wearing INFNITY, from the Troop wall on infinityclo.ca',
          consentStatus: 'implied_legacy',
          consentText:
            'Published on the legacy infinityclo.ca community wall ("Post and tag us @INFNITY.CLO to be here").',
          position: entry.position,
        })),
      )
      .onConflictDoNothing();
  })().catch((error: unknown) => {
    seeded = null;
    throw error;
  });
  return seeded;
}

export interface PublicCommunityPost {
  readonly id: string;
  readonly imageUrl: string;
  readonly alt: string;
  readonly handle: string | null;
  readonly caption: string | null;
  readonly productSlugs: readonly string[];
}

export async function approvedPosts(limit = 60): Promise<PublicCommunityPost[]> {
  try {
    await ensureCommunitySeed();
    const db = await getDb();
    const rows = await db
      .select({
        id: communityPosts.id,
        imageUrl: communityPosts.imageUrl,
        alt: communityPosts.alt,
        handle: communityPosts.handle,
        caption: communityPosts.caption,
        productSlugs: communityPosts.productSlugs,
        source: communityPosts.source,
      })
      .from(communityPosts)
      .where(eq(communityPosts.status, 'approved'))
      .orderBy(
        desc(communityPosts.source),
        asc(communityPosts.position),
        desc(communityPosts.createdAt),
      )
      .limit(limit);
    return rows.map((row) => ({
      id: row.id,
      imageUrl: row.imageUrl ?? `/api/community/media/${row.id}`,
      alt: row.alt,
      handle: row.handle,
      caption: row.caption,
      productSlugs: row.productSlugs,
    }));
  } catch (error) {
    if (process.env.NEXT_PHASE !== 'phase-production-build')
      console.error(`[community] ${(error as Error).message}`);
    // No database (e.g. during a static build): serve the legacy wall, which is approved by default.
    return (legacyWall as Array<{ id: string; imageUrl: string }>).slice(0, limit).map((entry) => ({
      id: entry.id,
      imageUrl: entry.imageUrl,
      alt: 'Customer wearing INFNITY, from the Troop wall on infinityclo.ca',
      handle: null,
      caption: null,
      productSlugs: [],
    }));
  }
}

export async function submitPost(input: {
  handle: string;
  caption: string | null;
  email: string;
  instagramUrl: string | null;
  image: Uint8Array | null;
  ipHash: string | null;
}): Promise<string> {
  let imageData: Buffer | null = null;
  if (input.image) {
    if (input.image.byteLength > MAX_UPLOAD_BYTES)
      throw new Error('Photos must be 6 MB or smaller.');
    if (!sniffImageType(input.image)) throw new Error('Upload a JPEG, PNG or WebP photo.');
    imageData = await sanitiseImage(input.image);
  }
  if (!imageData && !input.instagramUrl)
    throw new Error('Add a photo or a link to your Instagram post.');
  const db = await getDb();
  const id = `sub-${randomToken(9)}`;
  await db.insert(communityPosts).values({
    id,
    source: 'submission',
    status: 'pending',
    imageData,
    imageMime: imageData ? 'image/webp' : null,
    alt: `Customer photo submitted by @${input.handle}`,
    handle: input.handle,
    caption: input.caption,
    consentStatus: 'documented',
    consentText: COMMUNITY_CONSENT_TEXT,
    consentAt: new Date(),
    submitterEmail: input.email.toLowerCase(),
    instagramUrl: input.instagramUrl,
    ipHash: input.ipHash,
  });
  return id;
}

export async function listForModeration(
  statuses: string[] = ['pending', 'approved', 'hidden', 'rejected'],
) {
  await ensureCommunitySeed();
  const db = await getDb();
  return db
    .select({
      id: communityPosts.id,
      source: communityPosts.source,
      status: communityPosts.status,
      imageUrl: communityPosts.imageUrl,
      hasUpload: communityPosts.imageMime,
      alt: communityPosts.alt,
      handle: communityPosts.handle,
      caption: communityPosts.caption,
      productSlugs: communityPosts.productSlugs,
      consentStatus: communityPosts.consentStatus,
      consentAt: communityPosts.consentAt,
      submitterEmail: communityPosts.submitterEmail,
      instagramUrl: communityPosts.instagramUrl,
      moderatedBy: communityPosts.moderatedBy,
      moderatedAt: communityPosts.moderatedAt,
      moderationNote: communityPosts.moderationNote,
      createdAt: communityPosts.createdAt,
    })
    .from(communityPosts)
    .where(inArray(communityPosts.status, statuses))
    .orderBy(
      asc(communityPosts.status),
      desc(communityPosts.createdAt),
      asc(communityPosts.position),
    );
}

export async function moderate(
  id: string,
  update: {
    status: 'approved' | 'hidden' | 'rejected' | 'pending';
    alt?: string;
    handle?: string | null;
    caption?: string | null;
    productSlugs?: string[];
    note?: string | null;
    imageUrl?: string | null;
  },
  actor: AuditActor,
): Promise<void> {
  const db = await getDb();
  const [post] = await db.select().from(communityPosts).where(eq(communityPosts.id, id)).limit(1);
  if (!post) throw new Error('Post not found.');
  if (update.status === 'approved' && post.consentStatus === 'none') {
    throw new Error('This post has no recorded consent. Record consent before approving it.');
  }
  if (update.status === 'approved' && !post.imageUrl && !post.imageMime && !update.imageUrl) {
    throw new Error(
      'Attach the photo (upload to Shopify Files and paste its URL) before approving a link-only submission.',
    );
  }
  await db
    .update(communityPosts)
    .set({
      status: update.status,
      ...(update.alt !== undefined ? { alt: update.alt } : {}),
      ...(update.handle !== undefined ? { handle: update.handle } : {}),
      ...(update.caption !== undefined ? { caption: update.caption } : {}),
      ...(update.productSlugs !== undefined ? { productSlugs: update.productSlugs } : {}),
      ...(update.imageUrl ? { imageUrl: update.imageUrl } : {}),
      moderationNote: update.note ?? post.moderationNote,
      moderatedBy: actor.email,
      moderatedAt: new Date(),
    })
    .where(eq(communityPosts.id, id));
  await audit({
    actor,
    action: `community.${update.status}`,
    summary: `Set community post ${id} to ${update.status}`,
    targetType: 'community',
    targetId: id,
  });
}

/** Serves an uploaded image. Public only once approved; staff may preview pending ones. */
export async function mediaFor(
  id: string,
  allowUnapproved: boolean,
): Promise<{ bytes: Buffer; mime: string } | null> {
  const db = await getDb();
  const [row] = await db
    .select({
      data: communityPosts.imageData,
      mime: communityPosts.imageMime,
      status: communityPosts.status,
    })
    .from(communityPosts)
    .where(eq(communityPosts.id, id))
    .limit(1);
  if (!row?.data || !row.mime) return null;
  if (row.status !== 'approved' && !allowUnapproved) return null;
  return { bytes: row.data, mime: row.mime };
}

export { COMMUNITY_CONSENT_TEXT };
