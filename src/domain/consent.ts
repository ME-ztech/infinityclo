/**
 * Consent wording shown to customers. The exact string a person agreed to is
 * stored with their record, so these must only change deliberately — the
 * server rejects submissions that do not match the current wording.
 */
export const NEWSLETTER_CONSENT_TEXT =
  'Yes, email me about INFNITY drops, restocks and offers. I can unsubscribe at any time.';

export const WAITLIST_CONSENT_TEXT =
  'Email me when this drop releases. I can unsubscribe at any time.';

export const COMMUNITY_CONSENT_TEXT =
  'I took this photo (or have permission from who did), I am in it or have permission from everyone shown, and I give INFNITY permission to show it on infinityclo.ca and INFNITY social channels with my handle. I can ask for it to be removed at any time.';

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_PATTERN.test(value);
}
