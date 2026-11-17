import { getStaffSession } from '@/server/auth/staff';
import { mediaFor } from '@/server/community';

/** Serves re-encoded community uploads: public once approved, staff-only before. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) return new Response('Not found', { status: 404 });
  const staff = await getStaffSession().catch(() => null);
  const media = await mediaFor(id, Boolean(staff));
  if (!media) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(media.bytes), {
    headers: {
      'content-type': media.mime,
      'x-content-type-options': 'nosniff',
      'content-disposition': 'inline',
      'cache-control': staff ? 'private, no-store' : 'public, max-age=3600',
    },
  });
}
