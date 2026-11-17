import { expect, test } from '@playwright/test';

import { OWNER, SUPPORT, signIn } from './helpers';

/**
 * Back-office lifecycle against a throwaway PGlite database. Shopify Admin API
 * is deliberately NOT configured here, so these tests also prove that
 * Shopify-backed modules refuse to pretend.
 */
test.describe.configure({ mode: 'serial' });
test.skip(({ isMobile }) => isMobile, 'Back-office journey runs once, on desktop.');

test('staff sign-in rejects a wrong password and the admin is noindexed', async ({
  page,
  request,
}) => {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(OWNER.email);
  await page.getByLabel('Password').fill('not-the-password-1');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Email or password is incorrect.')).toBeVisible();
  const response = await request.get('/admin/login');
  expect(response.headers()['x-robots-tag']).toContain('noindex');
  // Unauthenticated access to the panel redirects to sign-in.
  await page.goto('/admin/promotions');
  await expect(page).toHaveURL(/\/admin\/login\?next=/);
});

test('owner signs in, sees honest Shopify gates, and creates a support account', async ({
  page,
}) => {
  await signIn(page, OWNER);
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  await page.goto('/admin/products');
  await expect(page.getByTestId('not-connected')).toBeVisible();
  await page.goto('/admin/orders');
  await expect(page.getByTestId('not-connected')).toBeVisible();

  await page.goto('/admin/settings');
  const form = page.getByTestId('create-staff');
  await form.getByLabel('Name').fill('Support Person');
  await form.getByLabel('Email').fill(SUPPORT.email);
  await form.getByLabel('Role').selectOption('support');
  await form.getByLabel('Temporary password').fill(SUPPORT.password);
  await form.getByRole('button', { name: 'Create account' }).click();
  await expect(form.getByTestId('action-ok')).toBeVisible();
});

test('RBAC: support cannot reach content or promotions approval', async ({ page }) => {
  await signIn(page, SUPPORT);
  await expect(
    page.getByRole('navigation', { name: 'Back office' }).getByRole('link', { name: 'Content' }),
  ).toHaveCount(0);
  await page.goto('/admin/content');
  await expect(page).toHaveURL(/\/admin\/forbidden/);
  await page.goto('/admin/promotions');
  await expect(page).toHaveURL(/\/admin\/forbidden/);
});

test('CMS: an announcement published in admin appears on the storefront without a deploy', async ({
  page,
}) => {
  await signIn(page, OWNER);
  await page.goto('/admin/content');
  const form = page.getByTestId('cms-announcement');
  await form.getByRole('checkbox').check();
  await form.getByLabel('Announcement text').fill('E2E: restock drops Friday');
  await form.getByRole('button', { name: 'Publish announcement' }).click();
  await expect(form.getByTestId('action-ok')).toContainText('Published');
  await page.goto('/');
  await expect(page.getByTestId('announcement-bar')).toHaveText(/restock drops Friday/);
});

test('promotions stay draft until the owner approves with a margin check, and never go live without Shopify', async ({
  page,
}) => {
  await signIn(page, OWNER);
  await page.goto('/admin/promotions');
  await page.getByRole('link', { name: /Bundle of 2/ }).click();
  const approve = page.getByRole('button', { name: 'Approve' });
  page.on('dialog', (dialog) => void dialog.accept());
  await approve.click();
  await expect(page.getByTestId('action-error').first()).toContainText(/margin/);

  await page.getByRole('spinbutton', { name: 'Percent off each' }).fill('15');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByTestId('action-ok').first()).toContainText('Draft saved');
  await page.getByLabel(/checked the margin impact/).check();
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('approved', { exact: true }).first()).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Publish to Shopify' }).click();
  await expect(page.getByTestId('action-error')).toContainText(/Admin API/);

  // The storefront advertises nothing: the offer is not live in Shopify.
  await page.goto('/products/infnitys-iced-raven-tank');
  await expect(page.getByTestId('pdp-offers')).toHaveCount(0);
});

test('drops: a coming-soon teaser with a deduplicated waitlist', async ({ page }) => {
  await signIn(page, OWNER);
  await page.goto('/admin/drops');
  const form = page.getByTestId('new-drop');
  await form.getByLabel('Name (internal and fallback headline)').fill('Next INFNITY drop');
  await form.getByLabel('URL slug').fill('e2e-next-drop');
  await form.getByLabel('Stage').selectOption('coming_soon');
  await form.getByLabel('Teaser headline').fill('Something new is coming');
  await form.getByRole('button', { name: 'Create drop' }).click();
  await expect(form.getByTestId('action-ok')).toBeVisible();

  await page.goto('/coming-soon');
  const teaser = page.getByTestId('drop-teaser');
  await expect(teaser).toContainText('Something new is coming');
  // No countdown: the release date was not confirmed.
  await expect(teaser.getByText(/days/i)).toHaveCount(0);
  for (const expected of [/on the list/i, /already on this list/i]) {
    await page.goto('/coming-soon');
    const waitlist = page.getByTestId('waitlist-form');
    await waitlist.getByLabel('Email address').fill('waiting@example.com');
    await waitlist.getByRole('checkbox').check();
    await waitlist.getByRole('button', { name: 'Notify me' }).click();
    await expect(page.getByTestId('waitlist-done')).toHaveText(expected);
  }
  await page.goto('/admin/drops');
  await expect(page.getByText('1 on waitlist')).toBeVisible();
});

test('community: submissions stay private until approved with a photo', async ({ page }) => {
  await page.goto('/styled-by-you');
  const submit = page.getByTestId('submit-fit-form');
  await submit.getByLabel('Instagram handle').fill('e2e_fit');
  await submit.getByLabel('Email (private)').fill('fit@example.com');
  await submit.getByLabel('…or link to your post').fill('https://www.instagram.com/p/e2e123/');
  await submit.getByRole('checkbox').check();
  await submit.getByRole('button', { name: 'Submit your fit' }).click();
  await expect(page.getByTestId('fit-submitted')).toBeVisible();
  await page.reload();
  await expect(page.getByText('@e2e_fit')).toHaveCount(0);

  await signIn(page, OWNER);
  await page.goto('/admin/community?status=pending');
  const card = page
    .getByTestId('moderation-card')
    .filter({ has: page.getByRole('link', { name: 'Instagram post' }) })
    .first();
  await card.getByRole('button', { name: 'Approve' }).click();
  await expect(card.getByTestId('action-error')).toContainText(/Attach the photo/);
  await card
    .getByLabel('Photo URL')
    .fill('https://cdn.shopify.com/s/files/1/0605/7069/7948/files/IMG_2143_2048x2048.jpg');
  await card.getByRole('button', { name: 'Approve' }).click();
  // Approved posts leave the pending queue.
  await expect(
    page
      .getByTestId('moderation-card')
      .filter({ has: page.getByRole('link', { name: 'Instagram post' }) }),
  ).toHaveCount(0);

  await page.goto('/styled-by-you');
  await expect(page.getByText('@e2e_fit')).toBeVisible();
});

test('inbox and audit log record what happened', async ({ page }) => {
  await page.goto('/contact?topic=return&order=%231001');
  const form = page.getByTestId('contact-form');
  await form.getByLabel('Name').fill('E2E Shopper');
  await form.getByLabel('Email').fill('shopper@example.com');
  await form
    .getByLabel('Message')
    .fill('The jorts are too big — can I exchange for a smaller size?');
  await form.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByTestId('contact-sent')).toBeVisible();

  await signIn(page, OWNER);
  await page.goto('/admin/messages');
  await expect(page.getByRole('link', { name: 'E2E Shopper' })).toBeVisible();
  await page.goto('/admin/settings');
  for (const action of [
    'cms.save',
    'promotion.approve',
    'drop.create',
    'community.approved',
    'staff.create',
  ]) {
    await expect(page.getByText(action, { exact: true }).first()).toBeVisible();
  }
});
