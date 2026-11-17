import { expect, test } from '@playwright/test';

import { expectNoHorizontalScroll, trackErrors } from './helpers';

const ROUTES = [
  '/',
  '/shop',
  '/shop?group=hoodies',
  '/search?q=tank',
  '/products/infnitys-iced-raven-tank',
  '/products/infnitys-black-varsity-hoodie',
  '/cart',
  '/styled-by-you',
  '/lookbook',
  '/coming-soon',
  '/size-guide',
  '/about',
  '/contact',
  '/faq',
  '/shipping',
  '/returns',
  '/privacy',
  '/terms',
  '/contact-information',
  '/account',
  '/account/orders',
  '/account/wishlist',
];

test.describe('routing integrity', () => {
  for (const route of ROUTES) {
    test(`${route} renders one h1, no errors, no sideways scroll`, async ({ page }) => {
      const errors = trackErrors(page);
      const response = await page.goto(route);
      expect(response?.status()).toBeLessThan(400);
      await expect(page.locator('h1')).toHaveCount(1);
      await expectNoHorizontalScroll(page);
      expect(errors).toEqual([]);
    });
  }

  test('unknown products 404', async ({ page }) => {
    expect((await page.goto('/products/not-a-real-product'))?.status()).toBe(404);
  });

  test('legacy Shopify URLs redirect permanently', async ({ request }) => {
    for (const [from, to] of [
      ['/collections/all', '/shop'],
      ['/pages/customer-gallery', '/styled-by-you'],
      ['/pages/contact', '/contact'],
      ['/policies/refund-policy', '/returns'],
      ['/policies/shipping-policy', '/shipping'],
    ]) {
      const response = await request.get(from!, { maxRedirects: 0 });
      expect(response.status(), from).toBe(308);
      expect(response.headers().location).toBe(to);
    }
  });

  test('robots and sitemap resolve and list product URLs', async ({ request }) => {
    expect((await request.get('/robots.txt')).ok()).toBe(true);
    const sitemap = await (await request.get('/sitemap.xml')).text();
    expect(sitemap).toContain('/products/infnitys-iced-raven-tank');
  });
});

test.describe('navigation and hero', () => {
  test('header carries the brand mark, the owner’s menu and a live cart count', async ({
    page,
    isMobile,
  }) => {
    await page.goto('/');
    const header = page.getByTestId('site-header');
    await expect(header.getByRole('link', { name: 'INFNITY.clo — home' })).toBeVisible();
    if (isMobile) {
      await header.getByRole('button', { name: 'Open menu' }).click();
      const menu = page.getByTestId('mobile-nav');
      for (const label of ['Home', 'Shop', 'Styled By You', 'Contact'])
        await expect(menu.getByRole('link', { name: label, exact: true })).toBeVisible();
      await menu.getByRole('button', { name: 'Close menu' }).click();
    } else {
      for (const label of ['Home', 'Shop', 'Styled By You', 'Contact'])
        await expect(header.getByRole('link', { name: label, exact: true })).toBeVisible();
      await expect(header.getByRole('link', { name: 'Account' })).toBeVisible();
    }
    await expect(page.getByTestId('cart-button')).toHaveAccessibleName(/Cart/);
  });

  test('hero shows the slogan, statements are selectable, and the slideshow pauses', async ({
    page,
  }) => {
    await page.goto('/');
    const hero = page.getByTestId('hero');
    await expect(hero.getByTestId('hero-slogan')).toHaveText(/Be the Statement/i);
    const pause = hero.getByTestId('hero-pause');
    await pause.click();
    await expect(pause).toHaveAttribute('aria-pressed', 'true');
    await hero.getByRole('button', { name: /Slide 2 of/ }).click();
    await expect(hero.getByRole('button', { name: /Slide 2 of/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await expect(hero.getByTestId('hero-cta')).toHaveAttribute('href', '/shop?group=hoodies');
  });

  test('homepage sections appear in the brief’s order', async ({ page }) => {
    await page.goto('/');
    const ids = [
      'statement-heading',
      'featured-heading',
      'vault-heading',
      'lookbook-heading',
      'community-heading',
      'newsletter-heading',
    ];
    const tops: number[] = [];
    for (const id of ids) {
      const box = await page.locator(`#${id}`).boundingBox();
      expect(box, id).not.toBeNull();
      tops.push(box!.y);
    }
    expect([...tops].sort((a, b) => a - b)).toEqual(tops);
    await expect(page.getByTestId('vault-cta')).toHaveAttribute('href', '/shop');
  });

  test('every footer link resolves', async ({ page, request }) => {
    await page.goto('/');
    const hrefs = await page
      .locator('footer a[href^="/"]')
      .evaluateAll((links) => [...new Set(links.map((link) => link.getAttribute('href')!))]);
    expect(hrefs.length).toBeGreaterThan(15);
    for (const href of hrefs) expect((await request.get(href)).status(), href).toBeLessThan(400);
  });
});
