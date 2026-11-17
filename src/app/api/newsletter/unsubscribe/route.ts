/**
 * Newsletter unsubscribe.
 *
 * The link carries an HMAC of the address, so only someone who received the
 * link can act on it. A bad or missing token gets the same neutral answer as a
 * good one for an unknown address — the endpoint cannot be used to discover
 * who is subscribed.
 *
 * GET does not change anything (mail scanners prefetch links); it forwards to
 * the confirmation page, which posts here. POST with the `List-Unsubscribe`
 * one-click body is also honoured.
 */
import { NextResponse } from 'next/server';

import { originFromHeaders } from '@/server/customer/context';
import { json } from '@/server/customer/forms';
import { isValidUnsubscribeToken, unsubscribeFromNewsletter } from '@/server/customer/newsletter';
import { clientAddress, normaliseEmail, rateLimit } from '@/server/security';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const target = new URL('/account/unsubscribe', originFromHeaders(request.headers));
  for (const key of ['email', 'token']) {
    const value = params.get(key);
    if (value) target.searchParams.set(key, value.slice(0, 300));
  }
  return NextResponse.redirect(target, 303);
}

export async function POST(request: Request) {
  const limit = rateLimit('newsletter-unsubscribe', clientAddress(request), 20, 600);
  if (!limit.allowed) return json({ error: 'Too many attempts. Please try again later.' }, 429);

  const params = new URL(request.url).searchParams;
  let email = params.get('email');
  let token = params.get('token');
  const wantsRedirect = (request.headers.get('content-type') ?? '').includes('form');
  if (wantsRedirect) {
    const form = await request.formData().catch(() => null);
    email = (form?.get('email') as string | null) ?? email;
    token = (form?.get('token') as string | null) ?? token;
  }

  const address = normaliseEmail(email);
  const valid = Boolean(address && isValidUnsubscribeToken(address, token));
  if (valid) {
    try {
      await unsubscribeFromNewsletter(address!);
    } catch (error) {
      console.error(`[newsletter] unsubscribe failed: ${(error as Error).message}`);
      return json({ error: 'We could not process that right now. Please try again.' }, 503);
    }
  }

  // A form post from the confirmation page (not a mail client's one-click POST) goes back to it.
  if (wantsRedirect && request.headers.get('origin')) {
    const target = new URL('/account/unsubscribe', originFromHeaders(request.headers));
    target.searchParams.set('done', valid ? '1' : '0');
    return NextResponse.redirect(target, 303);
  }
  return valid ? json({ message: 'You have been unsubscribed.' }) : json({ error: 'This unsubscribe link is not valid.' }, 400);
}
