/**
 * Serves community photos.
 *
 * A file is public only while its submission is `approved`. Pending and hidden
 * files are served solely to a request carrying a valid signed preview token,
 * which the admin generates for moderation. Everything else is a 404 — the
 * route does not reveal whether an unapproved file exists.
 *
 * Files were re-encoded to JPEG on upload, and are sent with a fixed image
 * content type and `nosniff`, so nothing uploaded can be interpreted as HTML or
 * script by a browser.
 */
import { listSubmissions } from '@/server/records';
import { fileFromMediaUrl, isValidPreviewToken, MEDIA_FILENAME, readUpload } from '@/server/uploads';

export const dynamic = 'force-dynamic';

const notFound = () => new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });

export async function GET(request: Request, context: { params: Promise<{ file: string }> }) {
  const { file } = await context.params;
  if (!MEDIA_FILENAME.test(file)) return notFound();

  const preview = isValidPreviewToken(file, new URL(request.url).searchParams.get('t'));
  if (!preview) {
    const submissions = await listSubmissions();
    const approved = submissions.some(
      (submission) => submission.status === 'approved' && fileFromMediaUrl(submission.image.url) === file,
    );
    if (!approved) return notFound();
  }

  const bytes = await readUpload(file);
  if (!bytes) return notFound();
  return new Response(new Uint8Array(bytes), {
    headers: {
      'content-type': 'image/jpeg',
      'content-length': String(bytes.length),
      'x-content-type-options': 'nosniff',
      'content-disposition': 'inline',
      'content-security-policy': "default-src 'none'; sandbox",
      // Approval can be withdrawn, so public copies are cached only briefly.
      'cache-control': preview ? 'private, no-store' : 'public, max-age=300',
    },
  });
}
