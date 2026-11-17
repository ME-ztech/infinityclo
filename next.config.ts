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

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
     * Product photography imported with the catalogue is served from this
     * origin (`public/products/`). A product published in Shopify after the last
     * import has no local copy yet, so its images are served — through Next's
     * optimiser — from the store's own Shopify CDN.
     */
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.shopify.com' },
      { protocol: 'https', hostname: 'infinityclo.ca' },
    ],
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
