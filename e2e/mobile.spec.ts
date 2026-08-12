import { expect, test } from '@playwright/test';

/**
 * Mobile-specific behaviour. Runs only on the mobile project, where the nav and
 * filter drawer have genuinely different implementations rather than being a
 * narrower version of the desktop layout.
 */
test.describe('mobile navigation', () => {
  test.skip(({ isMobile }) => !isMobile, 'mobile-only');

  test('opens the full-screen menu and navigates', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Open menu' }).click();
    const nav = page.getByTestId('mobile-nav');
    await expect(nav).toBeVisible();

    await nav.getByRole('link', { name: 'Shop', exact: true }).click();
    await expect(page).toHaveURL(/\/shop/);
    // The panel must not survive the navigation and cover the page.
    await expect(page.getByTestId('mobile-nav')).toBeHidden();
  });

  test('closes on Escape', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect(page.getByTestId('mobile-nav')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('mobile-nav')).toBeHidden();
  });

  test('locks background scroll while the menu is open', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open menu' }).click();

    const overflow = await page.evaluate(() => document.body.style.overflow);
    expect(overflow).toBe('hidden');
  });

  test('the filter drawer opens on shop', async ({ page }) => {
    await page.goto('/shop');
    await page.getByTestId('filter-open').click();
    await expect(page.getByTestId('filter-drawer')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('filter-drawer')).toBeHidden();
  });

  test('touch targets in the mobile menu are large enough', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open menu' }).click();

    const links = page.getByTestId('mobile-nav').getByRole('link');
    const count = await links.count();
    expect(count).toBeGreaterThan(3);

    for (let index = 0; index < count; index += 1) {
      const box = await links.nth(index).boundingBox();
      if (!box) continue;
      // 44px is the accessibility floor for a touch target.
      expect(box.height, `link ${index} is only ${box.height}px tall`).toBeGreaterThanOrEqual(44);
    }
  });
});
