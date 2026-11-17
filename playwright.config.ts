import { randomBytes, scryptSync } from 'node:crypto';
import { existsSync } from 'node:fs';

import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * E2E runs against a production build, not the dev server, so what is tested is
 * what ships — including static generation, route handlers and hydration.
 *
 * The server under test is fully isolated:
 *
 *   DATABASE_URL=pglite://.data-e2e/pglite   a throwaway embedded PostgreSQL,
 *                                            rebuilt from fixtures on every run
 *   PAYMENTS_PROVIDER=test + INFNITY_E2E=1   simulated payments that go through
 *                                            the same signed-webhook path as
 *                                            Stripe. No card network is touched.
 *
 * The admin owner account exists only for the run: a random password is
 * generated here, hashed with the same scrypt parameters the app verifies, and
 * handed to the specs through the environment. Nothing is committed.
 *
 * One worker: the embedded database is a single connection, and the purchase
 * tests deliberately contend for the same last unit of stock.
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

const serverEnv = {
  DATABASE_URL: 'pglite://.data-e2e/pglite',
  PAYMENTS_PROVIDER: 'test',
  INFNITY_E2E: '1',
  APP_ENV: 'staging',
  SESSION_SECRET: process.env.E2E_SESSION_SECRET ?? randomBytes(48).toString('base64url'),
  ADMIN_OWNER_EMAIL: 'owner@e2e.test',
  ADMIN_OWNER_PASSWORD_HASH: scryptHash(adminPassword),
  NEXT_PUBLIC_SITE_URL: BASE_URL,
  // Email is captured to a file the specs read, instead of being sent.
  INFNITY_EMAIL_OUTBOX: '.data-e2e/outbox.jsonl',
};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 60_000,

  use: {
    baseURL: BASE_URL,
    trace: 'off',
    screenshot: 'only-on-failure',
    // PW_CHANNEL=chrome uses an installed Chrome when Playwright's own browser
    // build is not present on the machine.
    channel: process.env.PW_CHANNEL || undefined,
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
    // Fixtures first, in their own process, then the server: the embedded
    // database allows one process at a time.
    command: `npx tsx --conditions=react-server scripts/e2e-fixtures.ts && npx next start --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 180_000,
    env: serverEnv,
  },
});
