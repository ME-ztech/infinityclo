import type { Metadata } from 'next';
import Image from 'next/image';

import { legacyWallAction, moderateSubmissionAction } from '@/app/admin/actions/local';
import { Badge, Button, Card, Empty, Flash, LinkButton, PageHeader, TextField, formatDate } from '@/components/admin/ui';
import wall from '@/data/catalog/ugc.json';
import type { UGCEntry } from '@/domain/types';
import { requirePage, type SearchParams } from '@/server/admin/page';
import { hiddenLegacyWallIds, listSubmissions, type CommunitySubmission } from '@/server/records';
import { fileFromMediaUrl, signedMediaUrl } from '@/server/uploads';

export const metadata: Metadata = { title: 'Community' };

const legacyWall = wall as unknown as readonly UGCEntry[];

const STATUS: Record<CommunitySubmission['status'], { label: string; tone: 'neutral' | 'good' | 'warn' }> = {
  pending: { label: 'Waiting for review', tone: 'warn' },
  approved: { label: 'On the wall', tone: 'good' },
  hidden: { label: 'Hidden', tone: 'neutral' },
};

const RIGHTS: Record<CommunitySubmission['rights'], string> = {
  legacy_wall: 'Carried over from the old site',
  submission: 'Submitter’s own recorded consent',
  owner_confirmed: 'Confirmed by the owner',
};

/** Pending uploads are not public; staff see them through a short-lived signed link. */
function previewUrl(submission: CommunitySubmission): string | null {
  const file = fileFromMediaUrl(submission.image.url);
  if (!file) return null;
  return submission.status === 'approved' ? submission.image.url : signedMediaUrl(file);
}

export default async function AdminCommunityPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePage('community.moderate');
  const params = await searchParams;
  const [hidden, submissions] = await Promise.all([hiddenLegacyWallIds(), listSubmissions()]);
  const pending = submissions.filter((submission) => submission.status === 'pending').length;

  return (
    <>
      <PageHeader
        title="Community"
        description="Styled By You. Nothing a customer uploads is public until it is approved here. Hiding takes effect on the storefront immediately."
        actions={<LinkButton href="/community" external>View the wall</LinkButton>}
      />
      <Flash params={params} />

      <Card
        id="submissions"
        title={`Submissions (${pending} waiting)`}
        description="Each upload was re-encoded on arrival (which removes location data and anything hidden in the file) and carries the consent wording the person agreed to."
      >
        {submissions.length === 0 ? (
          <Empty title="No submissions yet">Uploads from the Styled By You form appear here for review.</Empty>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2" data-testid="submission-list">
            {submissions.map((submission) => {
              const src = previewUrl(submission);
              return (
                <li key={submission.id} className="flex gap-4 border border-neutral-200 p-3" data-testid="submission">
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived staff preview; not an optimisable public asset
                    <img src={src} alt="Submitted photo" className="h-40 w-28 flex-none bg-neutral-100 object-cover" />
                  ) : (
                    <div className="flex h-40 w-28 flex-none items-center bg-neutral-100 p-2 text-center text-xs text-neutral-600">Preview unavailable</div>
                  )}
                  <div className="min-w-0 flex-1 text-sm">
                    <Badge tone={STATUS[submission.status].tone} testId="submission-status">{STATUS[submission.status].label}</Badge>
                    <dl className="mt-2 space-y-1">
                      <div>
                        <dt className="inline text-xs font-semibold text-neutral-600 uppercase">From: </dt>
                        <dd className="inline break-all">{submission.submitterEmail ?? '—'}</dd>
                      </div>
                      <div>
                        <dt className="inline text-xs font-semibold text-neutral-600 uppercase">Handle: </dt>
                        <dd className="inline">
                          {submission.handle ?? '—'} {submission.handle && (submission.creditPublicly ? '(asked to be credited)' : '(do not credit publicly)')}
                        </dd>
                      </div>
                      {submission.caption && (
                        <div>
                          <dt className="inline text-xs font-semibold text-neutral-600 uppercase">Caption: </dt>
                          <dd className="inline">{submission.caption}</dd>
                        </div>
                      )}
                      <div>
                        <dt className="inline text-xs font-semibold text-neutral-600 uppercase">Submitted: </dt>
                        <dd className="inline">{formatDate(submission.submittedAt)}</dd>
                      </div>
                      <div>
                        <dt className="inline text-xs font-semibold text-neutral-600 uppercase">Rights: </dt>
                        <dd className="inline">{RIGHTS[submission.rights]}</dd>
                      </div>
                      {submission.consentText && (
                        <div>
                          <dt className="text-xs font-semibold text-neutral-600 uppercase">Consent given</dt>
                          <dd className="text-xs leading-relaxed text-neutral-700">“{submission.consentText}”</dd>
                        </div>
                      )}
                      {submission.reviewedBy && (
                        <div className="text-xs text-neutral-600">
                          Last reviewed {formatDate(submission.reviewedAt)} by {submission.reviewedBy}
                        </div>
                      )}
                    </dl>

                    <form action={moderateSubmissionAction} className="mt-3 space-y-2">
                      <input type="hidden" name="id" value={submission.id} />
                      <TextField
                        label="Products in the photo"
                        name="productSlugs"
                        maxLength={120}
                        defaultValue={submission.productSlugs[0] ?? ''}
                        hint="Optional: one product handle, only if the item is clearly that product."
                      />
                      <div className="flex flex-wrap gap-2">
                        {submission.status !== 'approved' && (
                          <Button name="decision" value="approve" testId="submission-approve">Approve</Button>
                        )}
                        {submission.status !== 'hidden' && (
                          <Button variant="danger" name="decision" value="hide" testId="submission-hide">Hide</Button>
                        )}
                        <Button variant="secondary" name="decision" value="tag">Save tag</Button>
                        {submission.rights !== 'owner_confirmed' && (
                          <Button variant="secondary" name="decision" value="confirm_rights">Mark rights confirmed</Button>
                        )}
                      </div>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card
        title={`Legacy wall (${legacyWall.length - hidden.size} of ${legacyWall.length} shown)`}
        description="The 34 photos carried over from the old site’s “Troop” page. They are screenshots of customers’ posts, published under the old “tag us to be here” invitation rather than recorded consent — hide any you cannot vouch for, or that someone has asked to come down."
      >
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6" data-testid="legacy-wall">
          {legacyWall.map((entry) => {
            const isHidden = hidden.has(entry.id);
            return (
              <li key={entry.id} className="border border-neutral-200 p-2" data-testid="wall-entry" data-hidden={isHidden ? 'true' : 'false'}>
                <Image
                  src={entry.media.url}
                  alt={`Legacy wall photo ${entry.id}`}
                  width={160}
                  height={240}
                  className={`h-40 w-full object-cover ${isHidden ? 'opacity-30 grayscale' : ''}`}
                />
                <form action={legacyWallAction} className="mt-2">
                  <input type="hidden" name="id" value={entry.id} />
                  <input type="hidden" name="hidden" value={isHidden ? 'false' : 'true'} />
                  <Button variant={isHidden ? 'secondary' : 'danger'} testId={isHidden ? 'wall-show' : 'wall-hide'} aria-label={`${isHidden ? 'Show' : 'Hide'} ${entry.id}`}>
                    {isHidden ? 'Show again' : 'Hide'}
                  </Button>
                </form>
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}
