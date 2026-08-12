import { existsSync } from 'node:fs';

import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * E2E runs against a production build, not the dev server, so what is tested is
 * what ships — including static generation, route handlers and hydration.
 *
 * Desktop and mobile are both first-class here rather than mobile being an
 * afterthought: a fashion storefront takes most of its traffic on a phone, and
 * several behaviours (the nav, the filter drawer, the gallery) have genuinely
 * different implementations by viewport.
 */
/**
 * This image ships a pinned Chromium that will not match every @playwright/test
 * release. Point at that binary rather than downloading a matching build: the
 * environment pre-installs browsers deliberately and `playwright install` is not
 * to be run here. `CHROMIUM_PATH` overrides it for anyone running elsewhere.
 */
const CHROMIUM_PATH = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';
const executablePath = existsSync(CHROMIUM_PATH) ? CHROMIUM_PATH : undefined;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    launchOptions: { executablePath },
  },

  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],

  webServer: {
    command: `npx next start --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
