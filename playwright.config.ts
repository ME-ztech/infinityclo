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
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  // One worker: the admin journey mutates shared (throwaway) server state.
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'off',
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

  globalSetup: './e2e/global-setup.ts',

  /**
   * The build must be produced with the same CHECKOUT_MODE (see
   * docs/test-evidence.md): `CHECKOUT_MODE=permalink npm run build`.
   * The server runs against a fresh, throwaway PGlite database and a test
   * owner account; it never touches a production database or Shopify writes.
   */
  webServer: {
    command: `npx next start --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ALLOW_DEV_SECRET: 'true',
      PGLITE_DATA_DIR: '.data/e2e-pglite',
      ADMIN_BOOTSTRAP_EMAIL: 'owner@e2e.test',
      ADMIN_BOOTSTRAP_PASSWORD: 'e2e-owner-pass-2026',
      CHECKOUT_MODE: 'permalink',
      NODE_USE_ENV_PROXY: '1',
    },
  },
});
