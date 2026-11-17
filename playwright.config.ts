import { randomBytes, scryptSync } from 'node:crypto';
import { existsSync } from 'node:fs';

import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * E2E runs against a production build, not the dev server, so what is tested is
 * what ships — including static generation, route handlers and hydration.
 *
 * The server under test is deliberately isolated from the real store:
 *
 *   SHOPIFY_LIVE_CATALOG=off     the committed snapshot, so results are stable
 *   COMMERCE_ADMIN_MODE=sandbox  admin writes go to a local sandbox, never Shopify
 *   DATA_DIR=.data-e2e           a throwaway document store
 *
 * The admin owner account exists only for the run: a random password is
 * generated here, hashed with the same scrypt parameters the app verifies, and
 * handed to the specs through the environment. Nothing is committed.
 */
const CHROMIUM_PATH = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';
const executablePath = existsSync(CHROMIUM_PATH) ? CHROMIUM_PATH : undefined;

const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? randomBytes(18).toString('base64url');
process.env.E2E_ADMIN_PASSWORD = adminPassword;
process.env.E2E_ADMIN_EMAIL = 'owner@e2e.test';

function scryptHash(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

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
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      SHOPIFY_LIVE_CATALOG: 'off',
      COMMERCE_ADMIN_MODE: 'sandbox',
      DATA_DIR: '.data-e2e',
      SESSION_SECRET: randomBytes(48).toString('base64url'),
      ADMIN_OWNER_EMAIL: 'owner@e2e.test',
      ADMIN_OWNER_PASSWORD_HASH: scryptHash(adminPassword),
      NEXT_PUBLIC_SITE_URL: BASE_URL,
    },
  },
});
