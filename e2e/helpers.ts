import { expect, type Page } from '@playwright/test';

export const OWNER = { email: 'owner@e2e.test', password: 'e2e-owner-pass-2026' };
export const SUPPORT = { email: 'support@e2e.test', password: 'e2e-support-pass-2026' };

/** Collects console errors and uncaught exceptions, ignoring third-party image hiccups. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !/cdn\.shopify\.com|Failed to load resource/.test(message.text())) errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

export async function signIn(page: Page, who: { email: string; password: string }) {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(who.email);
  await page.getByLabel('Password').fill(who.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByTestId('admin-user')).toContainText(who.email, { timeout: 30_000 });
}

export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'page scrolls sideways').toBeLessThanOrEqual(1);
}
