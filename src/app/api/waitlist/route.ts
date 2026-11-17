/**
 * Drop waitlist signup.
 *
 * Accepted only for a drop that is publicly teased (coming soon or early
 * access) with its waitlist switched on, and only with explicit consent. One
 * entry per address per drop: a repeat signup is acknowledged, not duplicated.
 */
import { guardPublicForm, hasConsent, isHoneypotTripped, json, readJsonObject } from '@/server/customer/forms';
import { getDrop, joinWaitlist } from '@/server/records';
import { normaliseEmail } from '@/server/security';

export const dynamic = 'force-dynamic';

const SUCCESS = 'You’re on the waitlist. We’ll email you when it’s available.';

export async function POST(request: Request) {
  const guard = guardPublicForm(request, 'waitlist', 8);
  if (guard.refused) return guard.refused;

  const body = await readJsonObject(request);
  if (!body) return json({ error: 'Invalid request.' }, 400);
  if (isHoneypotTripped(body.website)) return json({ message: SUCCESS });

  const email = normaliseEmail(body.email);
  if (!email) return json({ error: 'Enter a valid email address.' }, 400);
  if (!hasConsent(body.consent)) {
    return json({ error: 'Please confirm you want to be emailed about this drop.', code: 'consent_required' }, 400);
  }

  const dropId = typeof body.dropId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(body.dropId) ? body.dropId : null;
  try {
    const drop = dropId ? await getDrop(dropId) : null;
    const open = drop && (drop.stage === 'coming_soon' || drop.stage === 'early_access') && drop.waitlistEnabled;
    if (!drop || !open) return json({ error: 'This waitlist is not open.', code: 'waitlist_closed' }, 404);

    const { created } = await joinWaitlist(drop.id, email);
    return json({ message: created ? SUCCESS : 'You’re already on the list for this drop.' });
  } catch (error) {
    console.error(`[waitlist] signup failed: ${(error as Error).message}`);
    return json({ error: 'We could not save that right now. Please try again.' }, 503);
  }
}
