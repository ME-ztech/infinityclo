import { expect, test } from '@playwright/test';

test.describe('consent and contact forms', () => {
  test('newsletter requires the unticked consent box, then confirms', async ({ page }) => {
    await page.goto('/');
    const form = page.locator('#newsletter').getByTestId('newsletter-form');
    await form.getByTestId('newsletter-email').fill(`fan+${Date.now()}@example.com`);
    await form.getByRole('button', { name: /join/i }).click();
    await expect(form.getByTestId('newsletter-message')).toHaveText(/Tick the box/);
    await form.getByTestId('newsletter-consent').check();
    await form.getByRole('button', { name: /join/i }).click();
    await expect(form.getByTestId('newsletter-message')).toHaveText(/on the list/i);
  });

  test('contact form validates and reaches the inbox', async ({ page }) => {
    await page.goto('/contact');
    const form = page.getByTestId('contact-form');
    await form.getByRole('button', { name: 'Send message' }).click();
    await expect(form.getByRole('alert')).toHaveText(/name/i);
    await form.getByLabel('Name').fill('E2E Shopper');
    await form.getByLabel('Email').fill('shopper@example.com');
    await form.getByLabel('Message').fill('Does the Recon Ops Jorts run large?');
    await form.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByTestId('contact-sent')).toBeVisible();
  });

  test('account pages hand off to Shopify-hosted accounts when the Customer Account API is not configured', async ({ page }) => {
    await page.goto('/account');
    await expect(page.getByTestId('hosted-account').getByRole('link', { name: 'Sign in / sign up' })).toHaveAttribute('href', /apparelinifinty85\.myshopify\.com\/account/);
  });
});
