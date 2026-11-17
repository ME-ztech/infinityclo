import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const PAGES = [
  '/',
  '/shop',
  '/products/infnitys-iced-raven-tank',
  '/cart',
  '/contact',
  '/styled-by-you',
  '/size-guide',
  '/admin/login',
];

test.describe('accessibility (axe, WCAG 2.1 A/AA)', () => {
  for (const path of PAGES) {
    test(`${path} has no serious or critical violations`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle').catch(() => undefined);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      const serious = results.violations.filter(
        (violation) => violation.impact === 'serious' || violation.impact === 'critical',
      );
      expect(
        serious.map(
          (violation) =>
            `${violation.id}: ${violation.nodes
              .slice(0, 3)
              .map((node) => node.target.join(' '))
              .join(' | ')}`,
        ),
      ).toEqual([]);
    });
  }
});
