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

/**
 * Mobile containment on the PDP.
 *
 * This is the one page where a rail sits inside a grid column, and that
 * combination shipped the worst layout bug of 1.1: the gallery's slides were a
 * viewport wide each, the column refused to be narrower than all of them at
 * once, and a four-shot product laid the document out four screens wide. Every
 * `vw`-sized thing on the page — the header, the breadcrumb, the
 * recommendations — then rendered into the left quarter of a page iOS had zoomed
 * out to fit, which is what the store owner photographed and reported.
 *
 * These run on both projects: the desktop grid is the other half of the same
 * component and must stay as it is.
 */
test.describe('product page containment', () => {
  /** Whichever catalogue is loaded, start from a product that really exists. */
  async function openFirstProduct(page: import('@playwright/test').Page) {
    await page.goto('/shop');
    const card = page.getByTestId('product-card').first();
    if ((await card.count()) === 0) return false;
    await card.getByRole('link').first().click();
    await expect(page.getByTestId('add-to-cart')).toBeVisible();
    return true;
  }

  test('the page never grows wider than the viewport', async ({ page }) => {
    test.skip(!(await openFirstProduct(page)), 'Catalogue is empty');

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));

    // One pixel of tolerance for sub-pixel rounding.
    expect(
      scrollWidth,
      `the product page is ${scrollWidth}px wide in a ${clientWidth}px viewport`,
    ).toBeLessThanOrEqual(clientWidth + 1);
  });

  test('the gallery shows one shot per viewport and swipes cleanly', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'The mobile gallery is a rail; desktop stacks.');
    test.skip(!(await openFirstProduct(page)), 'Catalogue is empty');

    const rail = page.getByTestId('gallery-rail');
    test.skip((await rail.count()) === 0, 'This catalogue has no photography');

    const geometry = await rail.evaluate((el) => ({
      railWidth: el.clientWidth,
      slideWidth: el.firstElementChild?.getBoundingClientRect().width ?? 0,
      slides: el.children.length,
      scrollWidth: el.scrollWidth,
      viewport: document.documentElement.clientWidth,
      snap: getComputedStyle(el).scrollSnapType,
    }));
    test.skip(geometry.slides < 2, 'Product has a single shot — nothing to swipe');

    // One garment shot fills the rail exactly: no half-images, no desktop
    // thumbnail strip eating the top of a phone screen.
    expect(Math.round(geometry.slideWidth)).toBe(geometry.railWidth);
    expect(geometry.railWidth).toBeLessThanOrEqual(geometry.viewport + 1);
    expect(geometry.snap).toContain('mandatory');

    // The extra shots live inside the rail's scroll width, not the page's.
    expect(geometry.scrollWidth).toBeGreaterThan(geometry.railWidth);

    // Driven through the pager rather than a synthetic scroll: the rail also
    // moves itself when a variant carries its own shot, and polling the settled
    // position is what makes this a claim about where a swipe *lands* rather
    // than a race with a smooth scroll still in flight.
    await page.getByRole('button', { name: 'Next image' }).click();
    await expect
      .poll(() => rail.evaluate((el) => Math.round(el.scrollLeft)), { timeout: 5000 })
      .toBe(geometry.railWidth);
  });

  test('the recommendations scroll inside their rail', async ({ page }, testInfo) => {
    test.skip(!(await openFirstProduct(page)), 'Catalogue is empty');

    const rack = page.getByTestId('product-rack').last();
    test.skip((await rack.count()) === 0, 'This product has no related pieces');
    await rack.scrollIntoViewIfNeeded();

    const geometry = await rack.evaluate((el) => ({
      display: getComputedStyle(el).display,
      railWidth: el.clientWidth,
      scrollWidth: el.scrollWidth,
      cardWidth: el.firstElementChild?.getBoundingClientRect().width ?? 0,
      cards: el.children.length,
      viewport: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
    }));

    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewport + 1);

    if (testInfo.project.name === 'mobile') {
      expect(geometry.display).toBe('flex');
      // A card narrower than the screen is what leaves the next piece peeking in
      // from the right — the affordance that says "swipe me".
      expect(geometry.cardWidth).toBeLessThan(geometry.viewport);
      expect(geometry.cardWidth / geometry.viewport).toBeGreaterThan(0.6);
      if (geometry.cards > 1) expect(geometry.scrollWidth).toBeGreaterThan(geometry.railWidth);
    } else {
      expect(geometry.display).toBe('grid');
      // Same 4px tolerance as the rack test above: the desktop grid is
      // `overflow-visible` so the quick-add control's transform counts towards
      // scrollWidth without the grid itself overflowing.
      expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.railWidth + 4);
    }
  });
});
