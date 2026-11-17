import Image from 'next/image';
import Link from 'next/link';

import { ActionForm } from '@/components/admin/ActionForm';
import { AdminPage, Badge, formatDate, inputClass } from '@/components/admin/ui';
import { requireStaffPage } from '@/server/auth/staff';
import { listForModeration } from '@/server/community';

import { moderateAction } from './actions';

export const metadata = { title: 'Community' };

const CONSENT = {
  documented: ['good', 'Consent recorded'],
  implied_legacy: ['warn', 'Legacy wall — confirm consent'],
  none: ['bad', 'No consent'],
} as const;

export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireStaffPage('community:moderate', '/admin/community');
  const { status = 'pending' } = await searchParams;
  const posts = await listForModeration(status === 'all' ? undefined : [status]);
  return (
    <AdminPage
      title="Community moderation"
      description="Nothing is public until approved. Approving requires recorded consent; legacy wall photos were already public on infinityclo.ca and are flagged so you can confirm consent with each person."
    >
      <div className="flex flex-wrap gap-2 text-sm">
        {['pending', 'approved', 'hidden', 'rejected', 'all'].map((key) => (
          <Link
            key={key}
            href={`/admin/community?status=${key}`}
            className={
              key === status
                ? 'bg-ink text-paper px-3 py-1.5'
                : 'border-line border bg-white px-3 py-1.5'
            }
          >
            {key}
          </Link>
        ))}
      </div>
      {posts.length === 0 && <p className="text-sm text-neutral-600">Nothing here.</p>}
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {posts.map((post) => {
          const src = post.imageUrl ?? (post.hasUpload ? `/api/community/media/${post.id}` : null);
          const [tone, label] = CONSENT[post.consentStatus as keyof typeof CONSENT] ?? CONSENT.none;
          return (
            <li
              key={post.id}
              className="border-line border bg-white p-4"
              data-testid="moderation-card"
            >
              <div className="relative mb-3 aspect-[4/5] bg-neutral-100">
                {src ? (
                  <Image
                    src={src}
                    alt={post.alt}
                    fill
                    sizes="300px"
                    className="object-cover"
                    unoptimized={src.startsWith('/api/')}
                  />
                ) : (
                  <p className="p-4 text-sm text-neutral-600">
                    Link only — attach the photo before approving.
                  </p>
                )}
              </div>
              <div className="mb-2 flex flex-wrap gap-2">
                <Badge>{post.status}</Badge>
                <Badge tone={tone}>{label}</Badge>
                <Badge tone="info">{post.source.replace('_', ' ')}</Badge>
              </div>
              {post.instagramUrl && (
                <a
                  href={post.instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm underline"
                >
                  Instagram post
                </a>
              )}
              {post.submitterEmail && (
                <p className="text-xs text-neutral-500">
                  From {post.submitterEmail} · {formatDate(post.createdAt)}
                </p>
              )}
              <ActionForm action={moderateAction} hideSubmit className="mt-3">
                <input type="hidden" name="id" value={post.id} />
                <input
                  name="alt"
                  defaultValue={post.alt}
                  className={inputClass}
                  aria-label="Alt text"
                />
                <input
                  name="handle"
                  defaultValue={post.handle ?? ''}
                  placeholder="@handle (shown publicly)"
                  className={inputClass}
                  aria-label="Handle"
                />
                <input
                  name="caption"
                  defaultValue={post.caption ?? ''}
                  placeholder="Caption"
                  className={inputClass}
                  aria-label="Caption"
                />
                <input
                  name="productSlugs"
                  defaultValue={post.productSlugs.join(', ')}
                  placeholder="Tagged product handles (only if factual)"
                  className={inputClass}
                  aria-label="Product tags"
                />
                {!post.imageUrl && !post.hasUpload && (
                  <input
                    name="imageUrl"
                    placeholder="Photo URL on Shopify CDN"
                    className={inputClass}
                    aria-label="Photo URL"
                  />
                )}
                <input
                  name="note"
                  defaultValue={post.moderationNote ?? ''}
                  placeholder="Moderation note (internal)"
                  className={inputClass}
                  aria-label="Note"
                />
                <div className="flex flex-wrap gap-2">
                  {(['approved', 'hidden', 'rejected'] as const).map((next) => (
                    <button
                      key={next}
                      type="submit"
                      name="status"
                      value={next}
                      className={
                        next === 'approved'
                          ? 'bg-ink text-paper h-9 px-3 text-xs font-semibold uppercase'
                          : 'border-ink h-9 border px-3 text-xs font-semibold uppercase'
                      }
                    >
                      {next === 'approved' ? 'Approve' : next === 'hidden' ? 'Hide' : 'Reject'}
                    </button>
                  ))}
                </div>
              </ActionForm>
            </li>
          );
        })}
      </ul>
    </AdminPage>
  );
}
