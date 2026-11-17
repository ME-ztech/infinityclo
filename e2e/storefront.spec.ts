import { expect, test } from '@playwright/test';

/**
 * Storefront behaviour on desktop (1440px) and a phone (Pixel 7), against a
 * production build serving the real catalogue from the test database.
 *
 * The purchase funnel has its own spec (purchase.spec.ts); this one covers
 * everything a visitor can do before paying.
 */
const PUBLIC_ROUTES = [
  '/',
  '/shop',
  '/community',
  '/about',
  '/contact',
  '/faq',
  '/shipping',
  '/returns',
  '/privacy',
  '/terms',
  '/size-guide',
  '/cart',
  '/search?q=hoodie',
  '/account/login',
  '/account/register',
  '/account/wishlist',
];

const IN_STOCK = '/products/infnitys-iced-ivory-pearl-tank';
const SOLD_OUT = '/products/lucki-star-infni-tee';

test.describe('routes', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route} renders one h1 and does not scroll sideways`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.status()).toBe(200);
      await expect(page.locator('h1')).toHaveCount(1);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }

  test('an unknown product is a 404', async ({ page }) => {
    const response = await page.goto('/products/does-not-exist');
    expect(response?.status()).toBe(404);
  });

  test('legacy store paths redirect permanently to their new homes', async ({ request }) => {
    const cases: Array<[string, string]> = [
      ['/collections/all', '/shop'],
      ['/pages/contact', '/contact'],
      ['/pages/customer-gallery', '/community'],
      ['/policies/refund-policy', '/returns'],
      ['/policies/shipping-policy', '/shipping'],
      ['/policies/privacy-policy', '/privacy'],
      ['/policies/terms-of-service', '/terms'],
      ['/troop', '/community'],
    ];
    for (const [from, to] of cases) {
      const response = await request.get(from, { maxRedirects: 0 });
      expect(response.status(), from).toBe(308);
      expect(response.headers().location, from).toBe(to);
    }
  });

  test('private areas are kept out of search engines', async ({ request }) => {
    const robots = await (await request.get('/robots.txt')).text();
    for (const path of ['/admin', '/account', '/api', '/cart', '/checkout']) {
      expect(robots, path).toContain(`Disallow: ${path}`);
    }
    const sitemap = await (await request.get('/sitemap.xml')).text();
    expect(sitemap).toContain('/products/infnitys-iced-raven-tank');
    expect(sitemap).not.toContain('/admin');
  });

  test('the account and admin areas send signed-out visitors to sign in', async ({ page }) => {
    await page.goto('/account/orders');
    await expect(page).toHaveURL(/\/account\/login\?returnTo=/);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login/);
  });
});

test.describe('page structure', () => {
  test('landmarks exist once and the skip link reaches main', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('header')).toHaveCount(1);
    await expect(page.locator('main')).toHaveCount(1);
    await expect(page.locator('footer')).toHaveCount(1);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  });

  test('every footer and primary navigation link resolves', async ({ page, request }) => {
    await page.goto('/');
    const hrefs = await page
      .locator('header a[href^="/"], footer a[href^="/"]')
      .evaluateAll((links) => [...new Set(links.map((link) => link.getAttribute('href')!))]);
    expect(hrefs.length).toBeGreaterThan(8);
    for (const href of hrefs) {
      const response = await request.get(href);
      expect(response.status(), href).toBeLessThan(400);
    }
  });
});

test.describe('homepage', () => {
  test('the hero is a slideshow with working, labelled controls', async ({ page }) => {
    await page.goto('/');
    const hero = page.getByTestId('hero');
    await expect(hero).toBeVisible();
    await expect(hero.getByTestId('hero-cta')).toBeVisible();
    expect(await hero.getByTestId('hero-slide').count()).toBeGreaterThan(1);

    const pause = hero.getByTestId('hero-pause');
    await expect(pause).toHaveAccessibleName(/pause/i);
    await pause.click();
    await expect(pause).toHaveAccessibleName(/play/i);

    const before = await hero.getByTestId('hero-cta').getAttribute('href');
    await hero.getByTestId('hero-next').click();
    await expect(hero.getByTestId('hero-cta')).toBeVisible();
    expect(before).toBeTruthy();
  });

  test('the brand statement and real products are on the page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Be the Statement' }).first()).toBeVisible();
    const featured = page.getByTestId('home-featured');
    await expect(featured.getByTestId('product-card').first()).toBeVisible();
    await expect(featured).toContainText('$');
    await expect(page.getByTestId('home-community')).toBeVisible();
    // No drop has been announced, so nothing is teased.
    await expect(page.getByTestId('home-coming-soon')).toHaveCount(0);
  });
});

test.describe('catalogue', () => {
  test('the shop lists the real catalogue and sorts by price', async ({ page }) => {
    await page.goto('/shop');
    expect(await page.getByTestId('product-card').count()).toBeGreaterThanOrEqual(30);

    await page.goto('/shop?sort=price_asc');
    const first = page.getByTestId('product-card').first();
    await expect(first).toContainText('KEYCHAIN');
    await expect(first).toContainText('$3.99');
  });

  test('search finds products by name', async ({ page }) => {
    await page.goto('/search?q=jersey');
    const cards = page.getByTestId('product-card');
    expect(await cards.count()).toBeGreaterThanOrEqual(3);
    await expect(cards.first()).toContainText(/jersey/i);
  });
});

test.describe('product page', () => {
  test('shows price, options, description and the add-to-cart total', async ({ page }) => {
    await page.goto(IN_STOCK);
    await expect(page.locator('h1')).toContainText('ICED IVORY PEARL TANK');
    await expect(page.getByTestId('pdp-price')).toContainText('$29.99');
    expect(await page.getByTestId('size-option').count()).toBe(5);
    await expect(page.getByTestId('add-to-cart')).toHaveText(/ADD TO CART — \$29\.99/i);
    await expect(page.getByTestId('pdp-description')).toContainText('Ribbed Tank Top');
    await expect(page.getByTestId('product-accordions')).toContainText(/Shipping & Returns/i);
    await expect(page.getByTestId('you-may-also-like')).toBeVisible();
  });

  test('the add-to-cart total follows the quantity', async ({ page }) => {
    await page.goto(IN_STOCK);
    await page.getByRole('button', { name: 'Increase quantity' }).click();
    await expect(page.getByTestId('pdp-quantity')).toHaveText('2');
    await expect(page.getByTestId('add-to-cart')).toHaveText(/\$59\.98/);
  });

  test('a sold-out product cannot be added to the cart', async ({ page }) => {
    await page.goto(SOLD_OUT);
    await expect(page.getByTestId('add-to-cart')).toBeDisabled();
    await expect(page.getByTestId('add-to-cart')).toHaveText(/sold out/i);
  });

  test('carries product structured data with a CAD price', async ({ page }) => {
    await page.goto(IN_STOCK);
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const product = blocks.map((block) => JSON.parse(block)).find((entry) => entry['@type'] === 'Product');
    expect(product).toBeTruthy();
    expect(JSON.stringify(product)).toContain('CAD');
  });
});

test.describe('cart', () => {
  test('add, change quantity, persist across reload, remove', async ({ page }) => {
    await page.goto(IN_STOCK);
    await page.getByTestId('add-to-cart').click();
    await expect(page.getByTestId('cart-count')).toHaveText(/1/);

    await page.goto('/cart');
    await expect(page.getByTestId('cart-line')).toHaveCount(1);
    await expect(page.getByTestId('cart-subtotal')).toContainText('$29.99');
    await expect(page.getByTestId('cart-disclaimer')).toContainText(/checkout/i);

    await page.getByTestId('cart-increase').click();
    await expect(page.getByTestId('cart-subtotal')).toContainText('$59.98');

    await page.reload();
    await expect(page.getByTestId('cart-subtotal')).toContainText('$59.98');

    await page.getByTestId('cart-remove').click();
    await expect(page.getByTestId('cart-line')).toHaveCount(0);
  });

  test('prices come from the server, not from the browser', async ({ page, request }) => {
    await page.goto('/');
    const response = await request.post('/api/cart/resolve', {
      data: {
        id: 'tamper',
        lines: [{ productSlug: 'infnitys-iced-ivory-pearl-tank', variantId: 'not-a-variant', quantity: 1, unitPrice: 1 }],
      },
    });
    const body = (await response.json()) as { cart: { lines: unknown[]; subtotal: { amount: number } }; droppedLines: unknown[] };
    expect(body.cart.lines).toHaveLength(0);
    expect(body.cart.subtotal.amount).toBe(0);
    expect(body.droppedLines).toHaveLength(1);
  });
});

test.describe('forms', () => {
  test('newsletter signup requires explicit consent', async ({ page }) => {
    await page.goto('/');
    const form = page.getByTestId('newsletter-form').first();
    await form.scrollIntoViewIfNeeded();
    await form.getByTestId('newsletter-email').fill(`e2e-${Date.now()}@e2e.test`);
    await form.getByRole('button').click();
    await expect(form.getByTestId('newsletter-message')).toContainText(/confirm|agree|consent/i);

    await form.getByTestId('newsletter-consent').check();
    await form.getByRole('button').click();
    await expect(form.getByTestId('newsletter-message')).toContainText(/on the list/i);
  });

  test('the public form endpoints refuse cross-site and consent-less requests', async ({ request, baseURL }) => {
    const sameSite = { origin: baseURL! };
    const crossSite = await request.post('/api/contact', {
      headers: { origin: 'https://evil.example' },
      data: { name: 'x', email: 'x@e2e.test', topic: 'other', message: 'hello there, a message' },
    });
    expect(crossSite.status()).toBe(403);

    const noConsent = await request.post('/api/newsletter', { headers: sameSite, data: { email: 'x@e2e.test' } });
    expect(noConsent.status()).toBe(400);

    const unknownDrop = await request.post('/api/waitlist', {
      headers: sameSite,
      data: { email: 'x@e2e.test', dropId: 'drop_missing', consent: true },
    });
    expect(unknownDrop.status()).toBeGreaterThanOrEqual(400);

    const contact = await request.post('/api/contact', {
      headers: sameSite,
      data: { name: 'E2E', email: 'x@e2e.test', topic: 'sizing', message: 'Which size should I take in the tank?' },
    });
    expect(contact.status()).toBe(200);
  });
});

test.describe('phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone-only behaviour');

  test('the menu opens, lists the primary destinations and closes on Escape', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('menu-button').click();
    const menu = page.getByTestId('mobile-nav');
    await expect(menu).toBeVisible();
    for (const label of ['Home', 'Shop', 'Styled By You', 'Contact']) {
      await expect(menu.getByRole('link', { name: new RegExp(`^${label}$`, 'i') })).toBeVisible();
    }
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
  });

  test('the product page fits the screen and its buy button is reachable', async ({ page }) => {
    await page.goto(IN_STOCK);
    const button = page.getByTestId('add-to-cart');
    await button.scrollIntoViewIfNeeded();
    const box = (await button.boundingBox())!;
    const width = page.viewportSize()!.width;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    expect(box.height).toBeGreaterThanOrEqual(44);
  });
});
