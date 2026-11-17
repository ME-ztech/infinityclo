import { expect, test, type BrowserContext, type Page } from '@playwright/test';

/**
 * Back-office lifecycle, against the real stack: a production build, the
 * INFNITY database (embedded PostgreSQL for the run) and the native gateway.
 * Nothing here is mocked — a product created in this spec is a real row that
 * the storefront then serves.
 *
 * The owner account exists only for the run; `playwright.config.ts` generates
 * its password and hands it over through the environment.
 *
 * Serial on purpose: the steps build on each other (create → stock → publish).
 * Desktop only: the dashboard is the same markup at every width, and running
 * the lifecycle twice in parallel would have two workers editing one record.
 *
 * The owner signs in ONCE and the session is reused. Sign-in is rate limited
 * (five attempts per fifteen minutes), which is exactly what a spec that logged
 * in before every test would trip — so this suite does not.
 */
test.describe.configure({ mode: 'serial' });
test.skip(({ isMobile }) => isMobile, 'The admin lifecycle runs once, on desktop.');

const EMAIL = process.env.E2E_ADMIN_EMAIL ?? '';
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? '';

// Unique per run, so a database kept from an earlier run cannot collide.
const RUN = Date.now().toString(36);
const PRODUCT_TITLE = `E2E Test Piece ${RUN}`;
const PRODUCT_HANDLE = `e2e-test-piece-${RUN}`;
const OFFER_TITLE = `E2E offer ${RUN}`;
const OFFER_CODE = `E2E${RUN}`.toUpperCase();
const HERO_TITLE = `E2E hero ${RUN}`;

let context: BrowserContext;
let admin: Page;

test.afterAll(async () => {
  await context?.close();
});

test.beforeAll(() => {
  expect(EMAIL, 'E2E_ADMIN_EMAIL must be provided by the Playwright config').not.toBe('');
  expect(PASSWORD, 'E2E_ADMIN_PASSWORD must be provided by the Playwright config').not.toBe('');
});

test('a signed-out visitor is sent to the login page', async ({ page }) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login/);
  await page.goto('/admin/orders');
  await expect(page).toHaveURL(/\/admin\/login/);
  // Exports are guarded too, and answer with a status rather than a page.
  const response = await page.request.get('/admin/customers/export');
  expect(response.status()).toBe(401);
});

test('a wrong password is rejected without saying which part was wrong', async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByTestId('login-email').fill(EMAIL);
  await page.getByTestId('login-password').fill(`${PASSWORD}-wrong`);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/\/admin\/login/);
  await expect(page.getByTestId('flash-error')).toBeVisible();
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login/);
});

test('the owner signs in and sees which system changes land in', async ({ browser }, testInfo) => {
  context = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  admin = await context.newPage();
  const page = admin;
  await page.goto('/admin/login');
  await page.getByTestId('login-email').fill(EMAIL);
  await page.getByTestId('login-password').fill(PASSWORD);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('session-identity')).toContainText(EMAIL);
  await expect(page.getByTestId('mode-banner')).toHaveAttribute('data-mode', 'native');
});

test('a product is created as a draft, stocked, published, and appears on the storefront', async () => {
  const page = admin;

  // Create — a draft, with nothing on the shelf.
  await page.goto('/admin/products/new');
  await page.getByTestId('product-title').fill(PRODUCT_TITLE);
  await page.getByTestId('product-price').fill('42.50');
  await page.getByTestId('option1-name').fill('Size');
  await page.getByTestId('option1-values').fill('M, L');
  await page.getByTestId('product-create-submit').click();
  await expect(page.getByTestId('flash-ok')).toBeVisible();
  await expect(page.getByTestId('product-status-badge')).toContainText(/draft/i);
  await expect(page.getByTestId('variant-row')).toHaveCount(2);
  const productUrl = page.url().split('?')[0]!;

  // A draft is not on the storefront.
  const hidden = await page.request.get(`/products/${PRODUCT_HANDLE}`);
  expect(hidden.status()).toBe(404);

  // Count stock in for the first size.
  await page.goto(`/admin/inventory?q=${encodeURIComponent(PRODUCT_TITLE)}`);
  const row = page.getByTestId('inventory-row').first();
  await expect(row).toContainText(PRODUCT_TITLE);
  await expect(row.getByTestId('inventory-available')).toHaveText('0');
  await row.getByTestId('inventory-quantity').fill('7');
  await row.getByTestId('inventory-save').click();
  await expect(page.getByTestId('flash-ok')).toBeVisible();
  // Saving returns to the unfiltered list, so look the product up again.
  await page.goto(`/admin/inventory?q=${encodeURIComponent(PRODUCT_TITLE)}`);
  await expect(page.getByTestId('inventory-row').first()).toContainText(PRODUCT_TITLE);
  await expect(page.getByTestId('inventory-row').first().getByTestId('inventory-available')).toHaveText('7');

  // Publish.
  await page.goto(productUrl);
  await page.getByTestId('product-publish').click();
  await expect(page.getByTestId('flash-ok')).toBeVisible();
  await expect(page.getByTestId('product-status-badge')).toContainText(/published|active/i);

  // It is now a real page on the storefront, with its real price.
  await page.goto(`/products/${PRODUCT_HANDLE}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(PRODUCT_TITLE);
  await expect(page.getByText('$42.50').first()).toBeVisible();
});

test('a shipping rate is added in settings', async () => {
  const page = admin;
  await page.goto('/admin/settings');
  await expect(page.getByTestId('settings-environment')).toBeVisible();

  const name = `E2E Standard ${RUN}`;
  await page.getByTestId('shipping-name').fill(name);
  await page.getByTestId('shipping-countries').fill('CA');
  await page.getByTestId('shipping-price').fill('15.00');
  await page.getByTestId('shipping-rate-add').click();
  await expect(page.getByTestId('flash-ok')).toContainText(name);
  await expect(page.locator(`[data-testid="shipping-rate-row"] input[name="name"][value="${name}"]`)).toHaveCount(1);

  // A malformed rate is refused and nothing is stored.
  await page.getByTestId('shipping-name').fill(`E2E Bad ${RUN}`);
  await page.getByTestId('shipping-countries').fill('Canada');
  await page.getByTestId('shipping-price').fill('15.00');
  await page.getByTestId('shipping-rate-add').click();
  await expect(page.getByTestId('flash-error')).toBeVisible();
  await expect(page.locator(`[data-testid="shipping-rate-row"] input[name="name"][value="E2E Bad ${RUN}"]`)).toHaveCount(0);
});

test('an offer stays a draft until the margin is checked and it is explicitly activated', async () => {
  const page = admin;

  await page.goto('/admin/promotions/new');
  await page.getByTestId('offer-title').fill(OFFER_TITLE);
  await page.getByTestId('offer-percent').fill('10');
  await page.getByTestId('offer-code').fill(OFFER_CODE);
  await page.getByTestId('offer-create-submit').click();
  await expect(page.getByTestId('flash-ok')).toBeVisible();
  await expect(page.getByTestId('offer-status')).toContainText(/draft/i);

  // Activation is refused before the margin check, even with the confirmation typed.
  await expect(page.getByTestId('offer-activate')).toBeDisabled();

  // Record the margin check.
  await page.getByTestId('offer-margin-form').getByRole('checkbox').check();
  await page.getByTestId('offer-margin-submit').click();
  await expect(page.getByTestId('offer-margin-ok')).toBeVisible();
  await expect(page.getByTestId('offer-status')).toContainText(/draft/i);

  // A wrong confirmation word does not activate.
  await page.getByTestId('confirm-confirm-activate').evaluate((input: HTMLInputElement) => input.removeAttribute('pattern'));
  await page.getByTestId('confirm-confirm-activate').fill('yes');
  await page.getByTestId('offer-activate').click();
  await expect(page.getByTestId('flash-error')).toBeVisible();
  await expect(page.getByTestId('offer-status')).toContainText(/draft/i);

  // The right one does.
  await page.getByTestId('confirm-confirm-activate').fill('ACTIVATE');
  await page.getByTestId('offer-activate').click();
  await expect(page.getByTestId('flash-ok')).toBeVisible();
  await expect(page.getByTestId('offer-status')).toHaveText(/^live$/i);

  // And the list shows it live.
  await page.goto('/admin/promotions');
  const listed = page.getByTestId('offer-row').filter({ hasText: OFFER_TITLE });
  await expect(listed.getByTestId('offer-status')).toHaveText(/^live$/i);
});

test('a hero slide title edited in the back office appears on the homepage', async () => {
  const page = admin;
  await page.goto('/admin/content');
  const title = page.getByTestId('slide-title-0');
  const original = await title.inputValue();

  await title.fill(HERO_TITLE);
  await page.getByTestId('content-save-all').click();
  await expect(page.getByTestId('flash-ok')).toBeVisible();

  await page.goto('/');
  await expect(page.getByTestId('hero').first()).toContainText(HERO_TITLE, { ignoreCase: true });

  // Put the original copy back so other specs see the default homepage.
  await page.goto('/admin/content');
  await page.getByTestId('slide-title-0').fill(original);
  await page.getByTestId('content-save-all').click();
  await expect(page.getByTestId('flash-ok')).toBeVisible();
});

test('a community wall photo can be hidden and shown again', async () => {
  const page = admin;
  await page.goto('/admin/community');
  const entries = page.getByTestId('wall-entry');
  await expect(entries.first()).toBeVisible();
  const shownBefore = await page.locator('[data-testid="wall-entry"][data-hidden="false"]').count();

  await page.locator('[data-testid="wall-entry"][data-hidden="false"]').first().getByTestId('wall-hide').click();
  await expect(page.getByTestId('flash-ok')).toBeVisible();
  await expect(page.locator('[data-testid="wall-entry"][data-hidden="false"]')).toHaveCount(shownBefore - 1);

  await page.locator('[data-testid="wall-entry"][data-hidden="true"]').first().getByTestId('wall-show').click();
  await expect(page.getByTestId('flash-ok')).toBeVisible();
  await expect(page.locator('[data-testid="wall-entry"][data-hidden="false"]')).toHaveCount(shownBefore);
});

test('every back-office section loads for the owner', async () => {
  const page = admin;
  for (const path of [
    '/admin',
    '/admin/products',
    '/admin/inventory',
    '/admin/orders',
    '/admin/customers',
    '/admin/promotions',
    '/admin/content',
    '/admin/drops',
    '/admin/community',
    '/admin/marketing',
    '/admin/inbox',
    '/admin/analytics',
    '/admin/settings',
  ]) {
    const response = await page.goto(path);
    expect(response?.status(), `${path} should load`).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }
});

test('signing out ends the session', async () => {
  const page = admin;
  await page.getByTestId('logout').click();
  await expect(page).toHaveURL(/\/admin\/login/);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login/);
});
