/**
 * Newsletter signup.
 *
 * Phase 1 has no email provider connected, so this route validates the address
 * and returns success **without persisting it**. That is a deliberate choice
 * over the two alternatives: storing addresses somewhere with no retention
 * policy or consent record, or failing the form and making the UI look broken.
 *
 * The response copy therefore confirms the submission was received rather than
 * promising a welcome email that nothing can send.
 *
 * To make this real in Phase 2, add the provider call where marked. The client
 * contract does not change.
 */
import { NextResponse } from 'next/server';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const payload = (body ?? {}) as Record<string, unknown>;
  const email = typeof payload.email === 'string' ? payload.email.trim() : '';

  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  // PHASE 2 SEAM: forward to the email provider here, then persist the consent
  // record (address, timestamp, source, IP) alongside it.

  return NextResponse.json({
    message: 'Received. The list opens with the next drop.',
  });
}
