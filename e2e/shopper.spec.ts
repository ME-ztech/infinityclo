import { expect, test } from '@playwright/test';

import { trackErrors } from './helpers';

test.describe('shopper funnel', () => {
  test('shop filters by category and search finds products', async ({ page }) => {
    await page.goto('/shop?group=hoodies');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(
      page
        .locator('main')
        .getByText(/hoodie/i)
        .first(),
    ).toBeVisible();
    await page.goto('/search?q=jorts');
    await expect(
      page
        .locator('main')
        .getByText(/OPS JORTS/i)
        .first(),
    ).toBeVisible();
  });

  test('product page: CAD price, accordions, honest variant availability', async ({ page }) => {
    await page.goto('/products/infni-tees-chaos');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/CHAOS/);
    await expect(
      page.getByTestId('product-accordions').getByText('Fit', { exact: true }),
    ).toBeVisible();
    for (const title of ['Fabric', 'Care', 'Shipping & Returns'])
      await expect(
        page.getByTestId('product-accordions').getByText(title, { exact: true }),
      ).toBeVisible();
    const add = page.getByTestId('add-to-cart');
    // Opens on the first available size; S is sold out in the live catalogue.
    await expect(add).toHaveText(/Add to cart — \$45\.00/);
    await page.getByTestId('size-option').filter({ hasText: /^S/ }).first().click();
    await expect(add).toBeDisabled();
    await expect(add).toHaveText(/Sold out/);
  });

  test('size guide opens with brand-published measurements', async ({ page }) => {
    await page.goto('/products/infnitys-signature-ivy-moss-patchwork-sweatpants');
    await page.getByTestId('size-guide-button').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Straight cut bottoms');
    await expect(dialog).toContainText('30–32');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('colourways sold as separate products link to each other', async ({ page }) => {
    await page.goto('/products/infnitys-black-varsity-hoodie');
    await expect(page.getByRole('link', { name: 'ASHEN GREY', exact: true })).toHaveAttribute(
      'href',
      '/products/infnitys-ashen-grey-varsity-hoodie',
    );
  });

  test('add to cart, persist across pages, update, remove and hand off to Shopify checkout', async ({
    page,
  }) => {
    const errors = trackErrors(page);
    let handoff: string | null = null;
    // Never reach the live store: capture the hand-off URL and stop there.
    await page.route('https://apparelinifinty85.myshopify.com/**', async (route) => {
      handoff = route.request().url();
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<h1>Shopify checkout (intercepted by test)</h1>',
      });
    });

    await page.goto('/products/infnitys-iced-raven-tank');
    await page.getByTestId('size-option').filter({ hasText: /^S$/ }).click();
    await expect(page.getByTestId('add-to-cart')).toHaveText('Add to cart — $29.99');
    await page.getByTestId('add-to-cart').click();
    await expect(page.getByTestId('cart-drawer')).toBeVisible();
    await expect(page.getByTestId('cart-subtotal')).toHaveText('$29.99');

    await page.goto('/cart');
    await expect(page.getByTestId('cart-subtotal')).toHaveText('$29.99');
    await page
      .getByRole('button', { name: /Increase quantity/i })
      .first()
      .click();
    await expect(page.getByTestId('cart-subtotal')).toHaveText('$59.98');

    // No live promotions exist, so no offer is advertised.
    await expect(page.getByTestId('cart-offers')).toHaveCount(0);

    await page.getByTestId('checkout-button').click();
    await expect.poll(() => handoff, { timeout: 20_000 }).not.toBeNull();
    expect(handoff).toMatch(
      /^https:\/\/apparelinifinty85\.myshopify\.com\/cart\/51495300563164:2\?/,
    );

    await page.goto('/cart');
    await page
      .getByRole('button', { name: /Remove/i })
      .first()
      .click();
    await expect(page.getByText(/Your cart is empty|empty/i).first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('checkout API refuses tampered and cross-origin requests', async ({ request, baseURL }) => {
    const crossOrigin = await request.post('/api/checkout', {
      headers: { origin: 'https://evil.example' },
      data: { lines: [] },
    });
    expect(crossOrigin.status()).toBe(403);
    const unknown = await request.post('/api/checkout', {
      headers: { origin: baseURL! },
      data: { lines: [{ productSlug: 'infnitys-iced-raven-tank', variantId: '999', quantity: 1 }] },
    });
    expect(unknown.status()).toBe(409);
    const soldOut = await request.post('/api/checkout', {
      headers: { origin: baseURL! },
      data: {
        lines: [{ productSlug: 'infni-tees-chaos', variantId: '46708110819548', quantity: 1 }],
      },
    });
    expect(soldOut.status()).toBe(409);
  });
});
