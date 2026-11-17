'use server';

/**
 * Account actions.
 *
 * These are Server Actions, so Next.js rejects any invocation whose Origin does
 * not match the host (CSRF). Each one additionally rate-limits by client
 * address, validates its input on the server, and acts only on the customer
 * identified by the session cookie — no action reads a customer id from a form.
 *
 * Answers that could reveal whether an email address has an account
 * (registration, password reset) are identical either way.
 */
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import {
  AccountError,
  changePassword,
  deleteAddress,
  registerCustomer,
  requestPasswordReset,
  resendVerification,
  resetPassword,
  saveAddress,
  signIn,
  signOut,
  updateProfile,
  verifyEmail,
} from '@/server/commerce/customers';
import { accountExistsEmail, passwordResetEmail, sendEmail, verificationEmail } from '@/server/commerce/emails';
import { getOrderForCustomer } from '@/server/commerce/orders';
import {
  clearSessionCookie,
  currentCustomer,
  safeReturnTo,
  sessionToken,
  setSessionCookie,
} from '@/server/commerce/session';
import { signUpForNewsletter, unsubscribeFromNewsletter } from '@/server/customer/newsletter';
import { TICKET_TOPICS, createTicket, type TicketTopic } from '@/server/records';
import { cleanText, rateLimit } from '@/server/security';

const text = (form: FormData, name: string): string => {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
};

async function limited(scope: string, limit: number, windowSeconds: number, extra = ''): Promise<boolean> {
  const list = await headers();
  const address = list.get('x-forwarded-for')?.split(',')[0]?.trim() || list.get('x-real-ip') || 'unknown';
  return !rateLimit(scope, `${address}:${extra}`, limit, windowSeconds).allowed;
}

const withMessage = (path: string, key: 'notice' | 'error', message: string): string =>
  `${path}${path.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(message)}`;

async function requireCustomer() {
  const customer = await currentCustomer();
  if (!customer) redirect('/account/login');
  return customer;
}

const CHECK_EMAIL = 'Check your email for a link to confirm your address.';

export async function registerAction(form: FormData): Promise<void> {
  if (await limited('account-register', 6, 3600)) {
    redirect(withMessage('/account/register', 'error', 'Too many attempts. Try again later.'));
  }
  try {
    const result = await registerCustomer({
      email: text(form, 'email'),
      password: text(form, 'password'),
      firstName: text(form, 'firstName'),
      lastName: text(form, 'lastName'),
      marketingConsent: form.get('marketingConsent') === 'on',
    });
    if (result.outcome === 'exists') {
      await sendEmail(accountExistsEmail(result.customer.email));
    } else {
      await sendEmail(verificationEmail(result.customer.email, result.verifyToken));
      if (result.outcome === 'created' && result.customer.marketingConsent) {
        await signUpForNewsletter(result.customer.email, 'registration');
      }
    }
  } catch (error) {
    if (error instanceof AccountError) redirect(withMessage('/account/register', 'error', error.message));
    throw error;
  }
  // The same answer whether or not the address already had an account.
  redirect(withMessage('/account/login', 'notice', CHECK_EMAIL));
}

export async function loginAction(form: FormData): Promise<void> {
  const returnTo = safeReturnTo(text(form, 'returnTo'));
  const email = text(form, 'email').trim().toLowerCase();
  // Two limits: per address+email (guessing one account) and per address (spraying many).
  if ((await limited('account-login', 8, 900, email)) || (await limited('account-login-ip', 40, 900))) {
    redirect(withMessage('/account/login', 'error', 'Too many sign-in attempts. Try again in a few minutes.'));
  }
  let token: string;
  try {
    token = (await signIn(email, text(form, 'password'))).sessionToken;
  } catch (error) {
    if (error instanceof AccountError) redirect(withMessage('/account/login', 'error', error.message));
    throw error;
  }
  await setSessionCookie(token);
  redirect(returnTo);
}

export async function logoutAction(): Promise<void> {
  await signOut(await sessionToken());
  await clearSessionCookie();
  redirect('/account/login');
}

export async function verifyAction(form: FormData): Promise<void> {
  try {
    await verifyEmail(text(form, 'token'));
  } catch (error) {
    if (error instanceof AccountError) redirect(withMessage('/account/login', 'error', error.message));
    throw error;
  }
  redirect(withMessage('/account/login', 'notice', 'Email confirmed. You can sign in now.'));
}

export async function resendVerificationAction(form: FormData): Promise<void> {
  if (await limited('account-resend', 4, 3600)) {
    redirect(withMessage('/account/login', 'error', 'Too many attempts. Try again later.'));
  }
  // Uses the reset lookup so an unknown address produces no email and no hint.
  const found = await requestPasswordReset(text(form, 'email'));
  if (found && !found.customer.emailVerifiedAt) {
    await sendEmail(verificationEmail(found.customer.email, await resendVerification(found.customer.id)));
  }
  redirect(withMessage('/account/login', 'notice', CHECK_EMAIL));
}

export async function forgotPasswordAction(form: FormData): Promise<void> {
  if (await limited('account-forgot', 5, 3600)) {
    redirect(withMessage('/account/forgot', 'error', 'Too many attempts. Try again later.'));
  }
  const found = await requestPasswordReset(text(form, 'email'));
  if (found) await sendEmail(passwordResetEmail(found.customer.email, found.token));
  redirect(
    withMessage('/account/forgot', 'notice', 'If that address has an account, a reset link is on its way. It expires in 60 minutes.'),
  );
}

export async function resetPasswordAction(form: FormData): Promise<void> {
  const token = text(form, 'token');
  if (await limited('account-reset', 10, 3600)) {
    redirect(withMessage('/account/forgot', 'error', 'Too many attempts. Try again later.'));
  }
  try {
    await resetPassword(token, text(form, 'password'));
  } catch (error) {
    if (error instanceof AccountError) {
      const back = error.code === 'token' ? '/account/forgot' : `/account/reset?token=${encodeURIComponent(token)}`;
      redirect(withMessage(back, 'error', error.message));
    }
    throw error;
  }
  redirect(withMessage('/account/login', 'notice', 'Password updated. Sign in with your new password.'));
}

export async function updateProfileAction(form: FormData): Promise<void> {
  const customer = await requireCustomer();
  const consent = form.get('marketingConsent') === 'on';
  await updateProfile(customer.id, {
    firstName: text(form, 'firstName'),
    lastName: text(form, 'lastName'),
    phone: text(form, 'phone'),
    marketingConsent: consent,
  });
  if (consent !== customer.marketingConsent) {
    if (consent) await signUpForNewsletter(customer.email, 'account');
    else await unsubscribeFromNewsletter(customer.email);
  }
  redirect(withMessage('/account/profile', 'notice', 'Profile saved.'));
}

export async function changePasswordAction(form: FormData): Promise<void> {
  const customer = await requireCustomer();
  if (await limited('account-password', 8, 3600)) {
    redirect(withMessage('/account/profile', 'error', 'Too many attempts. Try again later.'));
  }
  try {
    await changePassword(customer.id, text(form, 'currentPassword'), text(form, 'newPassword'), (await sessionToken()) ?? undefined);
  } catch (error) {
    if (error instanceof AccountError) redirect(withMessage('/account/profile', 'error', error.message));
    throw error;
  }
  redirect(withMessage('/account/profile', 'notice', 'Password changed. Other devices have been signed out.'));
}

export async function saveAddressAction(form: FormData): Promise<void> {
  const customer = await requireCustomer();
  const result = await saveAddress(
    customer.id,
    {
      firstName: text(form, 'firstName'),
      lastName: text(form, 'lastName'),
      line1: text(form, 'line1'),
      line2: text(form, 'line2'),
      city: text(form, 'city'),
      province: text(form, 'province'),
      postalCode: text(form, 'postalCode'),
      country: text(form, 'country'),
      phone: text(form, 'phone'),
      isDefault: form.get('isDefault') === 'on',
    },
    text(form, 'addressId') || null,
  );
  if (!result.address) redirect(withMessage('/account/addresses', 'error', result.problems.join(' ')));
  redirect(withMessage('/account/addresses', 'notice', 'Address saved.'));
}

export async function deleteAddressAction(form: FormData): Promise<void> {
  const customer = await requireCustomer();
  await deleteAddress(customer.id, text(form, 'addressId'));
  redirect(withMessage('/account/addresses', 'notice', 'Address removed.'));
}

/**
 * Help, return or exchange request. Creates a ticket for the team to review;
 * nothing is refunded or cancelled automatically.
 */
export async function helpRequestAction(form: FormData): Promise<void> {
  const customer = await requireCustomer();
  if (await limited('account-help', 6, 3600)) {
    redirect(withMessage('/account/help', 'error', 'Too many requests. Try again later.'));
  }
  const topic = text(form, 'topic') as TicketTopic;
  const message = cleanText(text(form, 'message'), 4000);
  if (!TICKET_TOPICS.includes(topic) || message.length < 10) {
    redirect(withMessage('/account/help', 'error', 'Choose a topic and tell us a little more (at least 10 characters).'));
  }
  // Only an order that belongs to this customer can be attached.
  const orderId = text(form, 'orderId');
  const order = orderId ? await getOrderForCustomer(customer.id, orderId) : null;
  await createTicket({
    topic,
    name: `${customer.firstName} ${customer.lastName}`.trim() || customer.email,
    email: customer.email,
    phone: customer.phone,
    orderNumber: order?.order.name ?? null,
    message,
    customerId: customer.id,
  });
  redirect(withMessage('/account/help', 'notice', 'Request received. Our team will review it and reply by email.'));
}
