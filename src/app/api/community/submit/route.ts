/**
 * Styled By You — photo submission.
 *
 * A submission is never published by this route. It is stored as `pending`
 * with the uploader's recorded consent, and appears on the wall only after a
 * member of staff approves it in the admin.
 *
 * The file is validated and re-encoded by `processUpload` (magic bytes, size,
 * decode, EXIF strip). On a host with no durable disk the endpoint says uploads
 * are unavailable instead of accepting a photo it would lose.
 */
import { guardPublicForm, hasConsent, isHoneypotTripped, json } from '@/server/customer/forms';
import { COMMUNITY_CONSENT_TEXT, saveSubmission, type CommunitySubmission } from '@/server/records';
import { cleanText, normaliseEmail } from '@/server/security';
import { newId } from '@/server/store';
import { MAX_UPLOAD_BYTES, processUpload, storeUpload, UploadError, uploadsEnabled } from '@/server/uploads';

export const dynamic = 'force-dynamic';

const SUCCESS = 'Photo received. It will appear on the wall once the team has reviewed it.';
const HANDLE = /^@?[A-Za-z0-9._]{1,30}$/;

export async function POST(request: Request) {
  const guard = guardPublicForm(request, 'community-submit', 5);
  if (guard.refused) return guard.refused;

  if (!uploadsEnabled()) {
    return json({ error: 'Photo uploads are not enabled on this deployment. Tag @infnity.clo on Instagram instead.', code: 'uploads_disabled' }, 503);
  }

  // Refuse oversized bodies before buffering them.
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_UPLOAD_BYTES + 64 * 1024) return json({ error: 'Photos must be 8 MB or smaller.' }, 413);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }
  if (isHoneypotTripped(form.get('website'))) return json({ message: SUCCESS });

  if (!hasConsent(form.get('consent'))) {
    return json({ error: 'Please confirm the photo is yours to share.', code: 'consent_required' }, 400);
  }
  const email = normaliseEmail(form.get('email'));
  if (!email) return json({ error: 'Enter a valid email address so we can reach you about your photo.' }, 400);

  const rawHandle = cleanText(form.get('handle'), 40);
  if (rawHandle && !HANDLE.test(rawHandle)) {
    return json({ error: 'Enter your handle using letters, numbers, dots or underscores only.' }, 400);
  }
  const handle = rawHandle ? `@${rawHandle.replace(/^@/, '')}` : null;

  const file = form.get('image');
  if (!(file instanceof Blob)) return json({ error: 'Choose a photo to upload.' }, 400);
  if (file.size > MAX_UPLOAD_BYTES) return json({ error: 'Photos must be 8 MB or smaller.' }, 413);

  try {
    const image = await processUpload(new Uint8Array(await file.arrayBuffer()));
    const stored = await storeUpload(image);
    const submission: CommunitySubmission = {
      id: newId('ugc'),
      status: 'pending',
      image: { url: stored.url, width: image.width, height: image.height },
      handle,
      creditPublicly: handle !== null && hasConsent(form.get('creditPublicly')),
      caption: cleanText(form.get('caption'), 200) || null,
      productSlugs: [],
      rights: 'submission',
      consentText: COMMUNITY_CONSENT_TEXT,
      submitterEmail: email,
      submittedAt: new Date().toISOString(),
      reviewedAt: null,
      reviewedBy: null,
    };
    await saveSubmission(submission);
    return json({ message: SUCCESS });
  } catch (error) {
    if (error instanceof UploadError) return json({ error: error.message }, error.status);
    console.error(`[community] submission failed: ${(error as Error).message}`);
    return json({ error: 'We could not save that photo right now. Please try again.' }, 503);
  }
}
