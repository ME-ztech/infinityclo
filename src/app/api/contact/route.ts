import { NextResponse } from 'next/server';

import { isValidEmail } from '@/domain/consent';
import { createMessage, MESSAGE_KINDS, type MessageKind } from '@/server/messages';
import { rateLimit } from '@/server/security/rate-limit';
import { contextFromHeaders, isSameOrigin } from '@/server/security/request';

const str = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

export async function POST(request: Request): Promise<NextResponse> {
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Cross-origin request refused.' }, { status: 403 });
  const context = contextFromHeaders(request.headers);
  let payload: Record<string, unknown>;
  try {
    payload = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  if (str(payload.website, 100)) return NextResponse.json({ message: 'Thanks — we’ll be in touch.' });

  const kind = (MESSAGE_KINDS as readonly string[]).includes(String(payload.kind)) ? (payload.kind as MessageKind) : 'contact';
  const name = str(payload.name, 120);
  const email = str(payload.email, 254);
  const orderNumber = str(payload.orderNumber, 40) || null;
  const body = str(payload.message, 4000);
  if (!name) return NextResponse.json({ error: 'Add your name.' }, { status: 400 });
  if (!isValidEmail(email)) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  if (kind !== 'contact' && !orderNumber) return NextResponse.json({ error: 'Add your order number.' }, { status: 400 });
  if (body.length < 10) return NextResponse.json({ error: 'Tell us a little more.' }, { status: 400 });

  const limited = await rateLimit(`contact:${context.ipHash ?? 'unknown'}`, 5, 60 * 60);
  if (!limited.allowed) return NextResponse.json({ error: 'Too many messages from here. Try again later.' }, { status: 429 });

  await createMessage({ kind, name, email, orderNumber, subject: null, body, ipHash: context.ipHash });
  return NextResponse.json({ message: 'Thanks — a real person will reply to your email.' });
}
