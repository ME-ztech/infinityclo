/**
 * Read-only audit of a deployed build.
 *
 *   node scripts/audit-deployed.mjs https://<deployment-url> [output-dir]
 *
 * Loads the main pages on a desktop and a phone viewport, records status,
 * console errors, failed requests, horizontal overflow, broken images and
 * first-load timing, checks response headers, and saves screenshots. It submits
 * nothing and signs in to nothing.
 *
 * Uses an installed Chrome when PW_CHANNEL=chrome is set.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium, devices } from '@playwright/test';

const base = process.argv[2]?.replace(/\/$/, '');
const outDir = process.argv[3] ?? 'docs/screenshots/deployed';
if (!base) {
  console.error('Usage: node scripts/audit-deployed.mjs <url> [output-dir]');
  process.exit(1);
}

const PAGES = [
  ['home', '/'],
  ['shop', '/shop'],
  ['product', '/products/infnitys-iced-raven-tank'],
  ['product-sold-out', '/products/lucki-star-infni-tee'],
  ['community', '/community'],
  ['contact', '/contact'],
  ['size-guide', '/size-guide'],
  ['returns', '/returns'],
  ['cart', '/cart'],
  ['account-login', '/account/login'],
];

const VIEWPORTS = [
  ['desktop', { viewport: { width: 1440, height: 900 } }],
  ['mobile', { ...devices['iPhone 13'] }],
];

// A protected deployment answers 200 with the host's sign-in page. Measuring
// that would produce a clean-looking report about the wrong site, so refuse.
const probe = await fetch(base + '/');
const probeHtml = await probe.text();
if (!/INFNITY/i.test(probeHtml)) {
  console.error(
    `${base} did not return the INFNITY storefront (status ${probe.status}). ` +
      'It is probably behind deployment protection. Audit a public URL or a local build instead.',
  );
  process.exit(2);
}

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const results = [];

for (const [device, options] of VIEWPORTS) {
  // WebKit-only device fields are ignored by Chromium; the viewport and UA apply.
  const { defaultBrowserType: _ignored, ...contextOptions } = options;
  const context = await browser.newContext(contextOptions);
  for (const [name, route] of PAGES) {
    const page = await context.newPage();
    const consoleErrors = [];
    const failedRequests = [];
    page.on('console', (message) => message.type() === 'error' && consoleErrors.push(message.text().slice(0, 200)));
    page.on('pageerror', (error) => consoleErrors.push(error.message.slice(0, 200)));
    page.on('requestfailed', (request) => failedRequests.push(request.url().slice(0, 120)));
    page.on('response', (response) => {
      if (response.status() >= 400 && !response.url().includes('/_vercel/')) {
        failedRequests.push(`${response.status()} ${response.url().slice(0, 120)}`);
      }
    });

    const response = await page.goto(base + route, { waitUntil: 'networkidle', timeout: 60_000 });
    const metrics = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const paint = performance.getEntriesByName('first-contentful-paint')[0];
      const images = [...document.images];
      return {
        h1: document.querySelectorAll('h1').length,
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        images: images.length,
        brokenImages: images.filter((image) => image.complete && image.naturalWidth === 0).length,
        imagesWithoutAlt: images.filter((image) => !image.hasAttribute('alt')).length,
        ttfbMs: Math.round(nav?.responseStart ?? 0),
        fcpMs: Math.round(paint?.startTime ?? 0),
        domContentLoadedMs: Math.round(nav?.domContentLoadedEventEnd ?? 0),
        transferKb: Math.round(
          performance.getEntriesByType('resource').reduce((total, entry) => total + (entry.transferSize || 0), 0) / 1024,
        ),
      };
    });
    await page.screenshot({ path: path.join(outDir, `${name}-${device}.png`), fullPage: name !== 'home' ? false : true });
    results.push({ device, name, route, status: response?.status() ?? 0, ...metrics, consoleErrors, failedRequests });
    await page.close();
  }
  await context.close();
}

const headerResponse = await fetch(base + '/');
const headers = Object.fromEntries(
  ['content-security-policy', 'strict-transport-security', 'x-frame-options', 'x-content-type-options', 'referrer-policy', 'permissions-policy', 'x-powered-by'].map(
    (name) => [name, headerResponse.headers.get(name)],
  ),
);
await browser.close();

await writeFile(path.join(outDir, 'audit.json'), JSON.stringify({ base, at: new Date().toISOString(), headers, results }, null, 2));

for (const row of results) {
  const flags = [
    row.status !== 200 && `status ${row.status}`,
    row.h1 !== 1 && `${row.h1} h1`,
    row.overflowX > 1 && `overflow ${row.overflowX}px`,
    row.brokenImages > 0 && `${row.brokenImages} broken images`,
    row.imagesWithoutAlt > 0 && `${row.imagesWithoutAlt} images without alt`,
    row.consoleErrors.length > 0 && `${row.consoleErrors.length} console errors`,
    row.failedRequests.length > 0 && `${row.failedRequests.length} failed requests`,
  ].filter(Boolean);
  console.log(
    `${row.device.padEnd(8)}${row.name.padEnd(18)}${String(row.status).padEnd(5)}fcp ${String(row.fcpMs).padStart(5)}ms  ${String(row.transferKb).padStart(5)}kB  ${flags.length ? flags.join('; ') : 'ok'}`,
  );
}
for (const [name, value] of Object.entries(headers)) console.log(`${name}: ${value ? value.slice(0, 80) : '(absent)'}`);
