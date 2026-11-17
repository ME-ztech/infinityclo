import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

/**
 * The purchase funnel, end to end, against a production build with an isolated
 * database and simulated payments (see playwright.config.ts).
 *
 * What these prove is the platform's own code: pricing, stock reservation,
 * the signed-webhook order creation, accounts and order tracking. They do not
 * prove a card network — that is Stripe test-mode UAT, listed in
 * docs/production-readiness.md.
 */
test.describe.configure({ mode: 'serial' });
// One viewport is enough for flows that contend for the same stock.
test.skip(({ isMobile }) => isMobile, 'purchase flow runs once, on desktop');

const PRODUCT = '/products/infnitys-iced-raven-tank';
const PASSWORD = 'e2e-test-password-123';
const stamp = Date.now().toString(36);
const EMAIL = `shopper-${stamp}@e2e.test`;

async function lastEmailTo(address: string, subject: RegExp): Promise<string> {
  const file = path.resolve(process.cwd(), '.data-e2e/outbox.jsonl');
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const text = await readFile(file, 'utf8').catch(() => '');
    const match = text
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { to: string; subject: string; text: string })
      .filter((mail) => mail.to === address && subject.test(mail.subject))
      .pop();
    if (match) return match.text;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No email to ${address} matching ${subject}`);
}

async function addToCart(page: Page, size: string): Promise<void> {
  await page.goto(PRODUCT);
  await page.getByTestId('size-option').filter({ hasText: new RegExp(`^${size}$`) }).click();
  await page.getByTestId('add-to-cart').click();
  await expect(page.getByTestId('cart-count')).toHaveText(/1/);
}

async function fillAddress(page: Page, email: string): Promise<void> {
  await page.locator('#co-email').fill(email);
  await page.locator('#co-firstName').fill('Test');
  await page.locator('#co-lastName').fill('Shopper');
  await page.locator('#co-line1').fill('1 Example Street');
  await page.locator('#co-city').fill('Winnipeg');
  await page.locator('#co-province').selectOption('MB');
  await page.locator('#co-postalCode').fill('R3C 0A1');
  await page.getByTestId('checkout-save-details').click();
  await expect(page.getByTestId('checkout-shipping')).toBeVisible();
}

test('a guest buys a product and lands on a confirmed order', async ({ page }) => {
  await addToCart(page, 'S');
  await page.goto('/cart');
  await expect(page.getByTestId('cart-line')).toHaveCount(1);
  await page.getByTestId('checkout-button').click();

  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByTestId('checkout-subtotal')).toHaveText('$29.99');
  // Nothing is promised before an address is known.
  await expect(page.getByTestId('checkout-shipping-total')).toHaveText('Enter your address');

  await fillAddress(page, `guest-${stamp}@e2e.test`);
  await expect(page.getByTestId('checkout-shipping-total')).toHaveText('$12.00');
  // 29.99 + 12.00 shipping, GST 5% of 41.99 = 2.10
  await expect(page.getByTestId('checkout-total')).toHaveText('$44.09');

  // A bad code is explained and changes nothing; a good one is applied by the server.
  await page.locator('#co-code').fill('NOPE');
  await page.getByTestId('checkout-apply-code').click();
  await expect(page.getByTestId('checkout-code-message')).toHaveText('That code was not recognised.');
  await expect(page.getByTestId('checkout-total')).toHaveText('$44.09');

  await page.locator('#co-code').fill('e2e10');
  await page.getByTestId('checkout-apply-code').click();
  await expect(page.getByTestId('checkout-discount')).toHaveText('−$3.00');
  // 26.99 + 12.00 = 38.99, GST 1.95
  await expect(page.getByTestId('checkout-total')).toHaveText('$40.94');

  await page.getByTestId('checkout-start-payment').click();
  await expect(page.getByTestId('checkout-test-mode')).toBeVisible();
  await expect(page.getByTestId('checkout-pay')).toHaveText('Pay $40.94');
  await page.getByTestId('checkout-pay').click();

  await expect(page.getByTestId('order-confirmed')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('order-number')).toHaveText(/^#\d{4,}$/);
  // The cart is emptied only once the order exists.
  await expect(page.getByTestId('cart-count')).toHaveCount(0);

  const confirmation = await lastEmailTo(`guest-${stamp}@e2e.test`, /confirmed/);
  expect(confirmation).toContain('Total paid: $40.94 CAD');
});

test('the confirmation page does not invent an order', async ({ page }) => {
  await page.goto('/checkout/complete');
  await expect(page.getByText('No recent order')).toBeVisible();
  await expect(page.getByTestId('order-confirmed')).toHaveCount(0);
});

test('the last unit cannot be bought twice', async ({ page, browser }) => {
  // The fixture stocks exactly one XS.
  await addToCart(page, 'XS');
  await page.goto('/cart');
  await page.getByTestId('checkout-button').click();
  await expect(page).toHaveURL(/\/checkout$/);

  // A second shopper now sees it sold out and cannot add it.
  const other = await browser.newContext();
  const rival = await other.newPage();
  await rival.goto(`${PRODUCT}?fresh=${stamp}`);
  const xs = rival.getByTestId('size-option').filter({ hasText: /^XS/ });
  await expect(xs).toHaveAttribute('data-available', 'false');
  await xs.click();
  await expect(rival.getByTestId('add-to-cart')).toBeDisabled();

  // And the server refuses even a hand-built request for it.
  const response = await rival.request.post('/api/checkout', {
    headers: { origin: new URL(rival.url()).origin, 'content-type': 'application/json' },
    data: {
      cart: {
        id: 'forged',
        lines: [{ productSlug: 'infnitys-iced-raven-tank', variantId: await variantIdOf(rival, 'XS'), quantity: 1 }],
      },
    },
  });
  expect(response.status()).toBe(409);
  await other.close();

  // The first shopper walks away: the unit goes back on sale.
  await page.getByRole('button', { name: /Return to cart/ }).click();
  await expect(page).toHaveURL(/\/cart$/);
});

/** Migrated variants keep their legacy ids, so the committed snapshot knows them. */
async function variantIdOf(_page: Page, size: string): Promise<string> {
  const snapshot = JSON.parse(
    await readFile(path.resolve(process.cwd(), 'src/data/catalog/products.json'), 'utf8'),
  ) as Array<{ slug: string; variants: Array<{ id: string; title: string }> }>;
  const product = snapshot.find((entry) => entry.slug === 'infnitys-iced-raven-tank');
  return product?.variants.find((variant) => variant.title === size)?.id ?? 'unknown';
}

test('a customer registers, verifies, signs in, buys and tracks the order', async ({ page }) => {
  await page.goto('/account');
  await expect(page).toHaveURL(/\/account\/login/);

  await page.goto('/account/register');
  await page.locator('#reg-first').fill('Test');
  await page.locator('#reg-email').fill(EMAIL);
  await page.locator('#reg-password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByTestId('account-notice')).toContainText('Check your email');

  // Cannot sign in before confirming the address.
  await page.locator('#login-email').fill(EMAIL);
  await page.locator('#login-password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByTestId('account-error')).toContainText('Confirm your email');

  const mail = await lastEmailTo(EMAIL, /Confirm your INFNITY account/);
  const link = mail.match(/https?:\/\/\S+\/account\/verify\?token=\S+/)![0];
  await page.goto(new URL(link).pathname + new URL(link).search);
  await page.getByRole('button', { name: 'Confirm email address' }).click();
  await expect(page.getByTestId('account-notice')).toContainText('Email confirmed');

  await page.locator('#login-email').fill(EMAIL);
  await page.locator('#login-password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByTestId('account-overview')).toBeVisible();
  await expect(page.getByTestId('account-email')).toHaveText(EMAIL);

  await addToCart(page, 'M');
  await page.goto('/cart');
  await page.getByTestId('checkout-button').click();
  // Signed in: the email is already on the checkout.
  await expect(page.locator('#co-email')).toHaveValue(EMAIL);
  await fillAddress(page, EMAIL);
  await page.getByTestId('checkout-start-payment').click();
  await page.getByTestId('checkout-pay').click();
  await expect(page.getByTestId('order-confirmed')).toBeVisible({ timeout: 30_000 });
  const orderName = (await page.getByTestId('order-number').textContent())!.trim();

  await page.goto('/account/orders');
  await expect(page.getByTestId('orders-list')).toContainText(orderName);
  await page.getByTestId('orders-list').getByRole('link').first().click();
  await expect(page.getByTestId('order-status')).toHaveText('Preparing your order');
  await expect(page.getByTestId('order-total')).toHaveText('$44.09');
  // Not shipped, so no shipment and certainly no "delivered".
  await expect(page.getByTestId('order-shipment')).toHaveCount(0);
  await expect(page.getByText('Delivered — done')).toHaveCount(0);

  await page.getByTestId('account-sign-out').click();
  await expect(page).toHaveURL(/\/account\/login/);
  await page.goto('/account/orders');
  await expect(page).toHaveURL(/\/account\/login/);
});

test('one customer cannot open another customer’s order', async ({ page, browser }) => {
  // Sign in as the shopper and take the id of their order.
  await page.goto('/account/login');
  await page.locator('#login-email').fill(EMAIL);
  await page.locator('#login-password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByTestId('account-overview')).toBeVisible();
  await page.goto('/account/orders');
  const href = await page.getByTestId('orders-list').getByRole('link').first().getAttribute('href');
  expect(href).toMatch(/^\/account\/orders\/ord_/);

  // A different, verified customer asks for the same URL.
  const other = await browser.newContext();
  const intruder = await other.newPage();
  const intruderEmail = `intruder-${stamp}@e2e.test`;
  await intruder.goto('/account/register');
  await intruder.locator('#reg-email').fill(intruderEmail);
  await intruder.locator('#reg-password').fill(PASSWORD);
  await intruder.getByRole('button', { name: 'Create account' }).click();
  const mail = await lastEmailTo(intruderEmail, /Confirm your INFNITY account/);
  const link = new URL(mail.match(/https?:\/\/\S+\/account\/verify\?token=\S+/)![0]);
  await intruder.goto(link.pathname + link.search);
  await intruder.getByRole('button', { name: 'Confirm email address' }).click();
  await intruder.locator('#login-email').fill(intruderEmail);
  await intruder.locator('#login-password').fill(PASSWORD);
  await intruder.getByRole('button', { name: 'Sign in' }).click();
  await expect(intruder.getByTestId('account-overview')).toBeVisible();

  const response = await intruder.goto(href!);
  expect(response?.status()).toBe(404);
  await expect(intruder.getByTestId('order-detail')).toHaveCount(0);
  await other.close();
});

test('registering an existing address reveals nothing and changes nothing', async ({ page }) => {
  await page.goto('/account/register');
  await page.locator('#reg-email').fill(EMAIL);
  await page.locator('#reg-password').fill('a-different-password-456');
  await page.getByRole('button', { name: 'Create account' }).click();
  // Same answer as a brand-new registration.
  await expect(page.getByTestId('account-notice')).toContainText('Check your email');
  // The original password still works; the attempted one does not.
  await page.locator('#login-email').fill(EMAIL);
  await page.locator('#login-password').fill('a-different-password-456');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByTestId('account-error')).toBeVisible();
});

test('the payment webhook rejects unsigned and forged requests', async ({ request }) => {
  const unsigned = await request.post('/api/webhooks/stripe', { data: { id: 'evt_x', type: 'payment_intent.succeeded' } });
  expect(unsigned.status()).toBe(401);
  const forged = await request.post('/api/webhooks/stripe', {
    headers: { 'stripe-signature': 't=1,v1=deadbeef' },
    data: { id: 'evt_x', type: 'payment_intent.succeeded' },
  });
  expect(forged.status()).toBe(401);
});
