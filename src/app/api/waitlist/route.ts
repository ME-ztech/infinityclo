import { NextResponse } from 'next/server';

import { isValidEmail } from '@/domain/consent';
import { joinWaitlist } from '@/server/drops';
import { rateLimit } from '@/server/security/rate-limit';
import { contextFromHeaders, isSameOrigin } from '@/server/security/request';

export async function POST(request: Request): Promise<NextResponse> {
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Cross-origin request refused.' }, { status: 403 });
  const context = contextFromHeaders(request.headers);
  let payload: Record<string, unknown>;
  try {
    payload = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const email = typeof payload.email === 'string' ? payload.email.trim() : '';
  const slug = typeof payload.slug === 'string' ? payload.slug.slice(0, 60) : '';
  if (!isValidEmail(email)) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  if (payload.consent !== true) return NextResponse.json({ error: 'Tick the box so we can email you about this drop.' }, { status: 400 });

  const limited = await rateLimit(`waitlist:${context.ipHash ?? 'unknown'}`, 10, 60 * 60);
  if (!limited.allowed) return NextResponse.json({ error: 'Too many sign-ups from here. Try again later.' }, { status: 429 });

  const outcome = await joinWaitlist({ slug, email, ipHash: context.ipHash });
  if (outcome === 'closed') return NextResponse.json({ error: 'This waitlist is not open.' }, { status: 404 });
  return NextResponse.json({
    status: outcome,
    message: outcome === 'joined' ? 'You’re on the list. We’ll email you when it drops.' : 'You’re already on this list.',
  });
}
