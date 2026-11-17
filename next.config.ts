import type { NextConfig } from 'next';

/**
 * Permanent redirects for every path the legacy Shopify storefront exposed, so
 * indexed links and old bookmarks land on the equivalent page here.
 *
 * `/products/<handle>` needs no entry: product handles are preserved exactly.
 */
const LEGACY_REDIRECTS: ReadonlyArray<readonly [source: string, destination: string]> = [
  // Collections. The store has one real collection ("all"); the catalogue with
  // its category filters is the equivalent surface.
  ['/collections', '/shop'],
  ['/collections/all', '/shop'],
  ['/collections/:handle', '/shop'],
  ['/collections/:handle/products/:product', '/products/:product'],

  // CMS pages.
  ['/pages/contact', '/contact'],
  ['/pages/customer-gallery', '/community'],
  ['/pages/jointhetroop', '/account'],
  ['/pages/tee-shirt-size-chart', '/size-guide#tee'],
  ['/pages/pullover-hoodies', '/size-guide#pullover-hoodie'],
  ['/pages/zip-up-hoodie-size-chart', '/size-guide#zip-hoodie'],
  ['/pages/bottom-size-chart', '/size-guide#bottoms'],
  ['/pages/bundle-of-2', '/size-guide'],

  // Policies.
  ['/policies/shipping-policy', '/shipping'],
  ['/policies/refund-policy', '/returns'],
  ['/policies/privacy-policy', '/privacy'],
  ['/policies/terms-of-service', '/terms'],
  ['/policies/contact-information', '/contact'],

  // Earlier names used by this storefront.
  ['/troop', '/community'],
  ['/styled-by-you', '/community'],
  ['/vault', '/shop'],
];

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Hosts product images may be served from besides this site — for example the
 * public domain of an object-storage bucket. Comma-separated host names.
 * Empty by default: every image the store ships with is a local file.
 */
const IMAGE_HOSTS = (process.env.NEXT_PUBLIC_IMAGE_HOSTS ?? '')
  .split(',')
  .map((host) => host.trim().toLowerCase())
  .filter((host) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host));

/**
 * Content-Security-Policy.
 *
 * Scripts and frames are limited to this site and Stripe (the payment form is
 * an iframe served by Stripe; Stripe.js must be loaded from js.stripe.com).
 * `'unsafe-inline'` is required by the framework's inline bootstrap scripts
 * and by structured-data blocks; moving to per-request nonces is the next
 * hardening step and is listed in docs/production-readiness.md.
 */
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://js.stripe.com`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob:${IMAGE_HOSTS.map((host) => ` https://${host}`).join('')}`,
  "font-src 'self' data:",
  `connect-src 'self' https://api.stripe.com${isDev ? ' ws: wss:' : ''}`,
  'frame-src https://js.stripe.com https://hooks.stripe.com',
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  ...(isDev ? [] : ['upgrade-insecure-requests']),
].join('; ');

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com")' },
  // Two years, as browsers' preload lists require. Only meaningful over HTTPS.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      { source: '/:path*', headers: SECURITY_HEADERS },
      // Per-person pages must never be stored by a shared cache.
      {
        source: '/:area(account|admin|checkout)/:path*',
        headers: [{ key: 'Cache-Control', value: 'private, no-store' }],
      },
    ];
  },
  // Database drivers are loaded by Node at runtime rather than bundled: the
  // embedded engine ships WebAssembly and `pg` has optional native bindings.
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
  // Lets a second dev server or build run beside the main one without sharing
  // (and locking) the same output directory.
  ...(process.env.NEXT_DIST_DIR && { distDir: process.env.NEXT_DIST_DIR }),
  async redirects() {
    return LEGACY_REDIRECTS.map(([source, destination]) => ({
      source,
      destination,
      permanent: true,
    }));
  },
  images: {
    /**
     * Product photography is served from this origin (`public/products/`).
     * Additional image hosts are opt-in via NEXT_PUBLIC_IMAGE_HOSTS; none is
     * needed today and nothing is loaded from the legacy store's CDN.
     */
    remotePatterns: IMAGE_HOSTS.map((hostname) => ({ protocol: 'https' as const, hostname })),
    formats: ['image/avif', 'image/webp'],
    /**
     * Trimmed to the widths this layout actually requests, so Next does not
     * generate and cache variants no breakpoint here ever asks for.
     */
    deviceSizes: [390, 430, 640, 828, 1080, 1200, 1600, 1920],
    imageSizes: [64, 96, 128, 200, 256, 384],
  },
};

export default nextConfig;
