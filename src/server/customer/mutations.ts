/**
 * Shared guard for account mutations.
 *
 * Every state-changing account request passes the same four checks, in order:
 * same origin (CSRF), rate limit, a valid sealed session, and input validation
 * in the handler. The customer acted on is always the session's own — no
 * handler reads a customer id from the form.
 *
 * Handlers are plain HTML form posts and answer with a redirect back to the
 * page, so the account area works without client-side JavaScript.
 */
import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';

import { clientAddress, cleanText, cookieAttributes, isSameOrigin, rateLimit, seal } from '../security';
import { CustomerAuthError } from '../shopify/customer-account';
import { originFromHeaders } from './context';
import { getCustomerGateway, type AddressInput, type CustomerAccountGateway, type MutationResult } from './gateway';
import {
  FLASH_COOKIE,
  FLASH_PURPOSE,
  FLASH_TTL_SECONDS,
  needsRefresh,
  readSessionFrom,
  type AccountFlash,
  type CookieJar,
  type CustomerSession,
} from './session';

export interface MutationContext {
  readonly form: FormData;
  readonly session: CustomerSession;
  readonly gateway: CustomerAccountGateway;
  readonly origin: string;
}

export type MutationOutcome = { readonly ok: true; readonly notice: string } | { readonly ok: false; readonly errors: readonly string[] };

export const fromResult = (result: MutationResult<unknown>, notice: string): MutationOutcome =>
  result.ok ? { ok: true, notice } : { ok: false, errors: result.errors };

function redirectTo(origin: string, page: string, params: Record<string, string> = {}): NextResponse {
  const url = new URL(page, origin);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = NextResponse.redirect(url, 303);
  response.headers.set('cache-control', 'no-store');
  return response;
}

/**
 * Redirects back to the page with a one-time message.
 *
 * The message travels in a sealed, 20-second cookie rather than the query
 * string, so a crafted link can never make an account page display text of an
 * attacker's choosing.
 */
function back(origin: string, page: string, flash: AccountFlash): NextResponse {
  const response = redirectTo(origin, page);
  const sealed = seal(flash, FLASH_PURPOSE, FLASH_TTL_SECONDS);
  if (sealed) response.cookies.set(FLASH_COOKIE, sealed, cookieAttributes({ maxAge: FLASH_TTL_SECONDS, path: '/account' }));
  return response;
}

export async function handleAccountMutation(
  request: NextRequest,
  options: { scope: string; page: string; limit?: number },
  handler: (context: MutationContext) => Promise<MutationOutcome>,
): Promise<NextResponse> {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'Cross-site request refused.' }, { status: 403 });
  }
  const origin = originFromHeaders(request.headers);
  const session = readSessionFrom(request.cookies as unknown as CookieJar);
  if (!session) return redirectTo(origin, '/account', { error: 'expired' });

  // Keyed on the session subject as well as the address, so one customer cannot
  // exhaust another's allowance from a shared network.
  const limit = rateLimit(`account-${options.scope}`, `${clientAddress(request)}:${session.subject}`, options.limit ?? 20, 60);
  if (!limit.allowed) return back(origin, options.page, { error: 'Too many attempts. Try again in a minute.' });

  if (needsRefresh(session)) {
    // The form is not replayed after a refresh; the customer resubmits.
    return redirectTo(origin, '/api/auth/customer/refresh', { returnTo: options.page });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return back(origin, options.page, { error: 'That request could not be read.' });
  }

  try {
    const outcome = await handler({ form, session, gateway: getCustomerGateway(origin), origin });
    return outcome.ok
      ? back(origin, options.page, { notice: outcome.notice })
      : back(origin, options.page, { error: outcome.errors.join(' ').slice(0, 300) });
  } catch (error) {
    if (error instanceof CustomerAuthError && error.code === 'unauthorized') {
      return redirectTo(origin, '/api/auth/customer/refresh', { returnTo: options.page });
    }
    console.error(`[account] ${options.scope} failed: ${(error as Error).message}`);
    return back(origin, options.page, { error: 'That change could not be saved. Please try again.' });
  }
}

const field = (form: FormData, name: string, max: number): string => cleanText(form.get(name), max);

/** Validates an address form. Returns the input, or the problems with it. */
export function parseAddressForm(form: FormData): { input: AddressInput } | { errors: string[] } {
  const input: AddressInput = {
    firstName: field(form, 'firstName', 60),
    lastName: field(form, 'lastName', 60),
    company: field(form, 'company', 80),
    address1: field(form, 'address1', 120),
    address2: field(form, 'address2', 120),
    city: field(form, 'city', 80),
    zoneCode: field(form, 'zoneCode', 10).toUpperCase(),
    territoryCode: field(form, 'territoryCode', 2).toUpperCase(),
    zip: field(form, 'zip', 16),
    phoneNumber: field(form, 'phoneNumber', 24),
  };
  const errors: string[] = [];
  if (!input.firstName || !input.lastName) errors.push('Enter a first and last name.');
  if (!input.address1) errors.push('Enter the street address.');
  if (!input.city) errors.push('Enter the city.');
  if (!/^[A-Z]{2}$/.test(input.territoryCode)) errors.push('Choose a country.');
  if (input.zoneCode && !/^[A-Z0-9]{1,6}$/.test(input.zoneCode)) errors.push('The province or state code is not valid.');
  if (!input.zip) errors.push('Enter the postal or ZIP code.');
  if (input.phoneNumber && !/^\+[1-9]\d{6,14}$/.test(input.phoneNumber.replace(/[\s()-]/g, ''))) {
    errors.push('Enter the phone number in international format, for example +12045550123.');
  }
  if (errors.length) return { errors };
  return { input: { ...input, phoneNumber: input.phoneNumber.replace(/[\s()-]/g, '') } };
}

export { field as formField };
