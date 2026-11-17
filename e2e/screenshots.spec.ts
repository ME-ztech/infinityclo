import { expect, test, type Page } from '@playwright/test';

/**
 * Evidence screenshots for docs/test-evidence.md. Opt-in:
 *
 *   SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts
 *
 * Captures the pages the purchase and admin specs exercise, on both viewports.
 */
test.skip(!process.env.SCREENSHOTS, 'set SCREENSHOTS=1 to capture evidence screenshots');
test.describe.configure({ mode: 'serial' });

const shot = (page: Page, name: string, device: string, fullPage = true) =>
  page.screenshot({ path: `docs/screenshots/${name}-${device}.png`, fullPage });

test('checkout, confirmation and account', async ({ page }, info) => {
  const device = info.project.name;
  const email = `shots-${device}-${Date.now().toString(36)}@e2e.test`;

  await page.goto('/products/infnitys-iced-soft-blush-tank');
  await page.getByTestId('size-option').filter({ hasText: /^M$/ }).click();
  await page.getByTestId('add-to-cart').click();
  await expect(page.getByTestId('cart-count')).toHaveText(/1/);
  await page.goto('/cart');
  await page.getByTestId('checkout-button').click();
  await expect(page).toHaveURL(/\/checkout$/);

  await page.locator('#co-email').fill(email);
  await page.locator('#co-firstName').fill('Test');
  await page.locator('#co-lastName').fill('Shopper');
  await page.locator('#co-line1').fill('1 Example Street');
  await page.locator('#co-city').fill('Winnipeg');
  await page.locator('#co-province').selectOption('MB');
  await page.locator('#co-postalCode').fill('R3C 0A1');
  await page.getByTestId('checkout-save-details').click();
  await expect(page.getByTestId('checkout-shipping')).toBeVisible();
  await page.getByTestId('checkout-start-payment').click();
  await expect(page.getByTestId('checkout-pay')).toBeVisible();
  await shot(page, 'checkout', device);

  await page.getByTestId('checkout-pay').click();
  await expect(page.getByTestId('order-confirmed')).toBeVisible({ timeout: 30_000 });
  await shot(page, 'checkout-confirmed', device, false);

  await page.goto('/account/login');
  await shot(page, 'account-login', device, false);
  await page.goto('/account/register');
  await shot(page, 'account-register', device, false);
});

test('admin', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'the back office is captured on desktop');
  await page.goto('/admin/login');
  await page.getByTestId('login-email').fill(process.env.E2E_ADMIN_EMAIL!);
  await page.getByTestId('login-password').fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('session-identity')).toBeVisible();

  for (const [path, name] of [
    ['/admin', 'admin-overview'],
    ['/admin/products', 'admin-products'],
    ['/admin/orders', 'admin-orders'],
    ['/admin/promotions', 'admin-promotions'],
    ['/admin/content', 'admin-content'],
    ['/admin/settings', 'admin-settings'],
  ] as const) {
    await page.goto(path);
    await expect(page.locator('h1')).toBeVisible();
    await page.screenshot({ path: `docs/screenshots/${name}.png`, fullPage: false });
  }

  await page.goto('/admin/orders');
  await page.getByTestId('order-row').first().getByRole('link').first().click();
  await expect(page.locator('h1')).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/admin-order-detail.png', fullPage: true });
});
