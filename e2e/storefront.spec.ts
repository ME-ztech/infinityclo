import { expect, test, type Page } from '@playwright/test';

/**
 * Storefront journeys.
 *
 * These cover everything that does not depend on catalog *content*: routing,
 * navigation, the cart and search shells, form validation, empty states and
 * accessibility structure. They pass against an empty catalog and continue to
 * pass once the real one is imported.
 *
 * Catalog-dependent journeys — filtering, variant selection, add-to-cart,
 * gallery navigation — live in `catalog.spec.ts` and skip themselves while the
 * catalog is empty, so the suite is honest about what it is and is not proving.
 */

/** Fails the test if the browser logged an error during the run. */
function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

const PRIMARY_ROUTES = [
  '/',
  '/shop',
  '/collections',
  '/vault',
  '/troop',
  '/about',
  '/contact',
  '/faq',
  '/shipping',
  '/returns',
  '/privacy',
  '/terms',
  '/cart',
  '/search',
  '/account',
  '/account/orders',
  '/account/wishlist',
];

test.describe('routing integrity', () => {
  for (const route of PRIMARY_ROUTES) {
    test(`${route} responds and renders a heading`, async ({ page }) => {
      const errors = trackConsoleErrors(page);
      const response = await page.goto(route);

      expect(response?.status(), `${route} should return 2xx`).toBeLessThan(400);
      await expect(page.locator('h1')).toHaveCount(1);
      expect(errors, `${route} logged console errors`).toEqual([]);
    });
  }

  test('an unknown product returns the not-found page', async ({ page }) => {
    const response = await page.goto('/products/definitely-not-a-real-product');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('an unknown collection returns the not-found page', async ({ page }) => {
    const response = await page.goto('/collections/definitely-not-a-real-collection');
    expect(response?.status()).toBe(404);
  });

  test('no primary navigation link is dead', async ({ page }) => {
    await page.goto('/');

    const hrefs = await page
      .locator('footer a[href^="/"]')
      .evaluateAll((links) =>
        Array.from(new Set(links.map((link) => link.getAttribute('href')).filter(Boolean))),
      );
    expect(hrefs.length).toBeGreaterThan(5);

    for (const href of hrefs) {
      const response = await page.request.get(href as string);
      expect(response.status(), `${href} is dead`).toBeLessThan(400);
    }
  });
});

test.describe('page structure', () => {
  test('the skip link is the first focus stop and reaches main', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');

    const skip = page.getByRole('link', { name: /skip to content/i });
    await expect(skip).toBeFocused();
    await expect(page.locator('#main')).toBeAttached();
  });

  test('landmarks are present exactly once', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('header')).toHaveCount(1);
    await expect(page.locator('main')).toHaveCount(1);
    await expect(page.locator('footer')).toHaveCount(1);
  });

  test('the preview notice discloses that checkout is not live', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('preview-notice')).toContainText(/checkout is not live/i);
  });
});

test.describe('search', () => {
  test('opens, searches, shows a no-results state, and closes on Escape', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Search' }).click();
    const overlay = page.getByTestId('search-overlay');
    await expect(overlay).toBeVisible();

    await page.getByTestId('search-input').fill('zzzzqqq');
    await expect(page.getByTestId('search-empty')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(overlay).toBeHidden();
  });

  test('the search results page renders a term', async ({ page }) => {
    await page.goto('/search?q=hoodie');
    await expect(page.locator('h1')).toContainText(/search/i);
  });
});

test.describe('cart', () => {
  test('opens the drawer and shows an empty state', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('cart-button').click();

    const drawer = page.getByTestId('cart-drawer');
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText(/your cart is empty/i);
  });

  test('closes the drawer on Escape and restores focus', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('cart-button').click();
    await expect(page.getByTestId('cart-drawer')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('cart-drawer')).toBeHidden();
    await expect(page.getByTestId('cart-button')).toBeFocused();
  });

  test('the cart page shows an empty state', async ({ page }) => {
    await page.goto('/cart');
    await expect(page.getByTestId('empty-state')).toContainText(/empty/i);
  });
});

test.describe('newsletter', () => {
  test('rejects an invalid address and accepts a valid one', async ({ page }) => {
    await page.goto('/');

    const form = page.getByTestId('newsletter-form').first();
    await form.getByTestId('newsletter-email').fill('nope');
    await form.getByRole('button', { name: /join/i }).click();
    await expect(form.getByTestId('newsletter-message')).toContainText(/valid email/i);

    await form.getByTestId('newsletter-email').fill('someone@example.com');
    await form.getByRole('button', { name: /join/i }).click();
    await expect(form.getByTestId('newsletter-message')).toContainText(/received/i);
  });
});

test.describe('contact', () => {
  test('validates and states plainly that nothing was sent', async ({ page }) => {
    await page.goto('/contact');

    // Scoped to the contact form: the footer newsletter also has an Email field.
    const form = page.getByTestId('contact-form');

    await form.getByRole('button', { name: /send/i }).click();
    await expect(form.getByRole('alert').first()).toBeVisible();

    await form.getByLabel('Name').fill('Test Person');
    await form.getByLabel('Email').fill('someone@example.com');
    await form.getByLabel('Message').fill('This is a long enough message.');
    await form.getByRole('button', { name: /send/i }).click();

    await expect(page.getByTestId('contact-blocked')).toContainText(/was not sent/i);
  });
});

test.describe('no horizontal overflow', () => {
  for (const route of ['/', '/shop', '/vault', '/troop', '/cart', '/about']) {
    test(`${route} does not scroll sideways`, async ({ page }) => {
      await page.goto(route);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      // One pixel of tolerance for sub-pixel rounding at fractional zoom.
      expect(overflow, `${route} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
    });
  }
});
