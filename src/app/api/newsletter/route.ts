/**
 * Newsletter signup.
 *
 * Requires explicit consent (`consent: true`) — an email address alone is not
 * permission to market to someone. The consent record is stored, and mirrored
 * to the Shopify customer when the Admin API is connected.
 *
 * The confirmation says only what is true: the address is on the list. It does
 * not promise a welcome email, because nothing here sends one.
 */
import { guardPublicForm, hasConsent, isHoneypotTripped, json, readJsonObject } from '@/server/customer/forms';
import { signUpForNewsletter } from '@/server/customer/newsletter';
import { cleanText, normaliseEmail } from '@/server/security';

export const dynamic = 'force-dynamic';

const SUCCESS = 'You’re on the list. We’ll email you about the next drop.';

export async function POST(request: Request) {
  const guard = guardPublicForm(request, 'newsletter', 8);
  if (guard.refused) return guard.refused;

  const body = await readJsonObject(request);
  if (!body) return json({ error: 'Invalid request.' }, 400);
  if (isHoneypotTripped(body.website)) return json({ message: SUCCESS });

  const email = normaliseEmail(body.email);
  if (!email) return json({ error: 'Enter a valid email address.' }, 400);
  if (!hasConsent(body.consent)) {
    return json({ error: 'Please confirm you want to receive emails from INFNITY.', code: 'consent_required' }, 400);
  }

  try {
    const result = await signUpForNewsletter(email, cleanText(body.source, 60) || 'site');
    return json({ message: result.created ? SUCCESS : 'You’re already on the list.' });
  } catch (error) {
    console.error(`[newsletter] signup failed: ${(error as Error).message}`);
    return json({ error: 'We could not save that right now. Please try again.' }, 503);
  }
}
