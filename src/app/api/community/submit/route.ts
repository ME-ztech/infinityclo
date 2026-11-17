import { NextResponse } from 'next/server';

import { isValidEmail } from '@/domain/consent';
import { MAX_UPLOAD_BYTES, submitPost } from '@/server/community';
import { rateLimit } from '@/server/security/rate-limit';
import { contextFromHeaders, isSameOrigin } from '@/server/security/request';

export async function POST(request: Request): Promise<NextResponse> {
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Cross-origin request refused.' }, { status: 403 });
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > MAX_UPLOAD_BYTES + 64 * 1024) return NextResponse.json({ error: 'Photos must be 6 MB or smaller.' }, { status: 413 });
  const context = contextFromHeaders(request.headers);
  const limited = await rateLimit(`community:${context.ipHash ?? 'unknown'}`, 5, 60 * 60);
  if (!limited.allowed) return NextResponse.json({ error: 'Too many submissions from here. Try again later.' }, { status: 429 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid submission.' }, { status: 400 });
  }
  const handle = String(form.get('handle') ?? '').trim().replace(/^@/, '').slice(0, 40);
  const email = String(form.get('email') ?? '').trim();
  const caption = String(form.get('caption') ?? '').trim().slice(0, 140) || null;
  const rawLink = String(form.get('instagramUrl') ?? '').trim();
  if (!/^[a-zA-Z0-9._]{1,30}$/.test(handle)) return NextResponse.json({ error: 'Enter a valid Instagram handle.' }, { status: 400 });
  if (!isValidEmail(email)) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  if (form.get('consent') !== 'on') return NextResponse.json({ error: 'Permission is required to feature your photo.' }, { status: 400 });
  let instagramUrl: string | null = null;
  if (rawLink) {
    try {
      const url = new URL(rawLink);
      if (url.protocol !== 'https:' || !/(^|\.)instagram\.com$/.test(url.hostname)) throw new Error();
      instagramUrl = url.toString().slice(0, 300);
    } catch {
      return NextResponse.json({ error: 'Links must be to instagram.com.' }, { status: 400 });
    }
  }
  const photo = form.get('photo');
  const image = photo instanceof File && photo.size > 0 ? new Uint8Array(await photo.arrayBuffer()) : null;
  try {
    await submitPost({ handle, caption, email, instagramUrl, image, ipHash: context.ipHash });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
  return NextResponse.json({ message: 'Got it — thank you. We review every fit before it goes on the wall.' });
}
