/**
 * Newsletter sign-up. Requires the unticked consent box (express consent) and
 * records the exact wording, time, source and a hashed IP as evidence.
 */
import { NextResponse } from 'next/server';

import { isValidEmail, NEWSLETTER_CONSENT_TEXT } from '@/domain/consent';
import { subscribe } from '@/server/newsletter';
import { rateLimit } from '@/server/security/rate-limit';
import { contextFromHeaders, isSameOrigin } from '@/server/security/request';

export async function POST(request: Request): Promise<NextResponse> {
  if (!isSameOrigin(request))
    return NextResponse.json({ error: 'Cross-origin request refused.' }, { status: 403 });
  const context = contextFromHeaders(request.headers);

  let payload: Record<string, unknown>;
  try {
    payload = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const email = typeof payload.email === 'string' ? payload.email.trim() : '';
  if (!isValidEmail(email))
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  if (payload.consent !== true) {
    return NextResponse.json(
      { error: 'Tick the box to confirm you want our emails.' },
      { status: 400 },
    );
  }
  // A honeypot field real people never see.
  if (typeof payload.company === 'string' && payload.company.length > 0) {
    return NextResponse.json({ message: 'You are on the list.' });
  }

  const limited = await rateLimit(`newsletter:${context.ipHash ?? 'unknown'}`, 8, 60 * 60);
  if (!limited.allowed)
    return NextResponse.json(
      { error: 'Too many sign-ups from here. Try again later.' },
      { status: 429 },
    );

  const source = typeof payload.source === 'string' ? payload.source.slice(0, 40) : 'unknown';
  const origin = new URL(request.url).origin;
  const outcome = await subscribe({
    email,
    source,
    consentText: NEWSLETTER_CONSENT_TEXT,
    ipHash: context.ipHash,
    origin,
  });

  const messages = {
    subscribed: 'You’re on the list. You’ll hear about the next drop first.',
    pending_confirmation: 'Almost there — check your inbox and tap the link to confirm.',
    already_subscribed: 'You’re already on the list.',
  } as const;
  return NextResponse.json({ status: outcome, message: messages[outcome] });
}
