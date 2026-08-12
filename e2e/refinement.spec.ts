import { expect, test } from '@playwright/test';

/**
 * STOREFRONT 1.1 behaviours.
 *
 * These cover the things the refinement actually changed, and each one exists
 * because it broke at least once while building it:
 *
 * - the rack was a flex rail that beat `md:grid` in the cascade and ran off the
 *   right edge of every desktop screen;
 * - the quick-add overlay claimed pointer events across the whole card and
 *   silently stopped the product image being a link;
 * - the header was `fixed`, so the breadcrumb slid underneath it as soon as the
 *   preview notice wrapped to two lines on a 393px phone.
 *
 * A passing suite that did not check these would have shipped all three.
 */

test.describe('the room rhythm', () => {
  test('the homepage alternates light and dark surfaces', async ({ page }) => {
    await page.goto('/');

    const surfaces = await page.$$eval('[data-surface]', (els) =>
      els
        .filter((el) => el.closest('main') !== null || el.tagName === 'FOOTER')
        .map((el) => el.getAttribute('data-surface')),
    );

    // The whole point of 1.1: black is a contrast, not the background. Both
    // families must be present, or the page has collapsed back to one canvas.
    expect(surfaces.some((s) => s === 'bone' || s === 'paper' || s === 'concrete')).toBe(true);
    expect(surfaces.some((s) => s === 'ink' || s === 'void')).toBe(true);
  });

  test('the footer closes the page on true black', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('footer')).toHaveAttribute('data-surface', 'void');
  });
});

test.describe('product rack', () => {
  test('scrolls horizontally on a phone and becomes a grid on desktop', async ({
    page,
  }, testInfo) => {
    await page.goto('/');
    const rack = page.locator('main ul').first();
    await expect(rack).toBeVisible();

    const display = await rack.evaluate((el) => getComputedStyle(el).display);

    if (testInfo.project.name === 'mobile') {
      expect(display).toBe('flex');
      const scrollable = await rack.evaluate((el) => el.scrollWidth > el.clientWidth + 4);
      expect(scrollable, 'the mobile rail must actually scroll').toBe(true);
    } else {
      expect(display).toBe('grid');
      const overflows = await rack.evaluate((el) => el.scrollWidth > el.clientWidth + 4);
      expect(overflows, 'the desktop grid must not overflow').toBe(false);
    }
  });
});

test.describe('product card', () => {
  test('the image stays a link to the product page', async ({ page }) => {
    await page.goto('/shop');
    const card = page.getByTestId('product-card').first();
    await card.hover();

    // Clicking the middle of the photograph must navigate, even while the
    // quick-add control is showing over the foot of the image.
    await card.locator('a').first().click();
    await expect(page).toHaveURL(/\/products\//);
  });

  test('quick add puts a real product in the bag', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'Quick add is a hover control on desktop only.');

    await page.goto('/shop');
    const card = page.getByTestId('product-card').first();
    await card.hover();

    const quickAdd = card.getByRole('button', { name: /quick add|add to bag/i });
    await quickAdd.click();

    // Products with an option axis open the sheet; single-variant ones go
    // straight in. Both must end with one line in the bag.
    if (
      await page
        .getByTestId('quick-add')
        .isVisible()
        .catch(() => false)
    ) {
      await page.getByTestId('quick-add-confirm').click();
    }

    await expect(page.getByTestId('cart-count')).toHaveText('1');
  });
});

test.describe('wishlist', () => {
  test('saving a piece survives a reload and counts in the header', async ({ page }, testInfo) => {
    await page.goto('/shop');
    await page.getByTestId('wishlist-toggle').first().click();

    await expect(page.getByTestId('wishlist-toggle').first()).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await page.reload();
    await expect(page.getByTestId('wishlist-toggle').first()).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // The header's saved count is a desktop affordance; the control itself is
    // on every card at every width.
    if (testInfo.project.name !== 'mobile') {
      await expect(page.getByRole('link', { name: /wishlist, 1 saved/i })).toBeVisible();
    }
  });
});

test.describe('catalogue', () => {
  test('a section chip narrows the grid and is reflected in the URL', async ({ page }) => {
    await page.goto('/shop');
    const total = await page.getByTestId('product-card').count();

    const chip = page.getByRole('link', { name: 'Hoodies', exact: true });
    test.skip((await chip.count()) === 0, 'No hoodies in this catalogue');

    await chip.click();
    await expect(page).toHaveURL(/group=hoodies/);

    const narrowed = await page.getByTestId('product-card').count();
    expect(narrowed).toBeGreaterThan(0);
    expect(narrowed).toBeLessThanOrEqual(total);
  });

  test('sorting by price ascending puts the cheapest piece first', async ({ page }) => {
    await page.goto('/shop?sort=price_asc');
    const first = await page.getByTestId('product-card').first().textContent();
    // The seed's cheapest piece is the socks pack at $9.99; with the imported
    // catalogue this simply asserts the sort produced a coherent first card.
    expect(first).toBeTruthy();

    const prices = await page.$$eval('[data-testid="product-card"]', (cards) =>
      cards
        .map((card) => card.textContent?.match(/\$([\d,.]+)/)?.[1])
        .filter((v): v is string => Boolean(v))
        .map((v) => Number.parseFloat(v.replace(/,/g, ''))),
    );
    const sorted = [...prices].sort((a, b) => a - b);
    expect(prices).toEqual(sorted);
  });
});

test.describe('sticky header', () => {
  test('never covers the top of the page content', async ({ page }) => {
    await page.goto('/products/infnitys-varsity-hoodie');

    const headerBottom = await page
      .locator('header')
      .evaluate((el) => el.getBoundingClientRect().bottom);
    const breadcrumbTop = await page
      .getByRole('navigation', { name: 'Breadcrumb' })
      .evaluate((el) => el.getBoundingClientRect().top);

    expect(breadcrumbTop).toBeGreaterThanOrEqual(headerBottom - 1);
  });
});

test.describe('product page', () => {
  test('renders the buy panel with a price and a working add control', async ({ page }) => {
    await page.goto('/products/infnitys-varsity-hoodie');

    await expect(page.locator('h1')).toContainText('Varsity Hoodie');
    await expect(page.getByTestId('add-to-cart')).toBeEnabled();

    // Real price from the brand's own storefront, not a placeholder.
    await expect(page.locator('main')).toContainText('$45.98');
    await expect(page.locator('main')).toContainText('$69.98');
  });

  test('the colour selector drives the selection', async ({ page }) => {
    await page.goto('/products/infnitys-varsity-hoodie');

    const options = page.getByTestId('product-option');
    test.skip((await options.count()) < 2, 'Product has no second option value');

    await options.nth(1).click();
    await expect(options.nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect(options.first()).toHaveAttribute('aria-pressed', 'false');
  });
});
