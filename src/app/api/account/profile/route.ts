/**
 * Profile edits and email-marketing preference, written through the customer's
 * own Customer Account API token.
 *
 * Marketing consent is its own explicit action (`intent=marketing`); saving a
 * name never changes it, and holding an account never implies it.
 */
import type { NextRequest } from 'next/server';

import { formField, fromResult, handleAccountMutation } from '@/server/customer/mutations';

export const dynamic = 'force-dynamic';

export function POST(request: NextRequest) {
  return handleAccountMutation(request, { scope: 'profile', page: '/account/profile' }, async ({ form, session, gateway }) => {
    if (form.get('intent') === 'marketing') {
      const subscribe = form.get('subscribe') === 'yes';
      const result = await gateway.setMarketingConsent(session.accessToken, subscribe);
      return fromResult(result, subscribe ? 'You are subscribed to marketing emails.' : 'You are unsubscribed from marketing emails.');
    }
    const firstName = formField(form, 'firstName', 60);
    const lastName = formField(form, 'lastName', 60);
    if (!firstName || !lastName) return { ok: false, errors: ['Enter your first and last name.'] };
    return fromResult(await gateway.updateProfile(session.accessToken, { firstName, lastName }), 'Profile updated.');
  });
}
