import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    /**
     * Photography is served from the owner's Shopify CDN at the requested width
     * (see src/lib/image-loader.ts). This keeps Shopify as the system of record
     * for media and removes the image optimiser's server-side fetch entirely.
     */
    loader: 'custom',
    loaderFile: './src/lib/image-loader.ts',
    deviceSizes: [390, 430, 640, 828, 1080, 1200, 1600, 1920],
    imageSizes: [64, 96, 128, 200, 256, 384],
  },
  /** PGlite ships WASM and data files that must not be bundled. */
  serverExternalPackages: ['@electric-sql/pglite', 'sharp'],
  /** Migrations are read from disk at runtime; include them in the serverless bundle. */
  outputFileTracingIncludes: { '/**': ['./src/server/db/migrations/**/*'] },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
      { source: '/admin/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }, { key: 'Cache-Control', value: 'private, no-store' }] },
      { source: '/account/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex' }, { key: 'Cache-Control', value: 'private, no-store' }] },
    ];
  },
  /** Legacy Shopify theme URLs keep working (and keep their SEO) after cutover. */
  async redirects() {
    return [
      { source: '/collections/all', destination: '/shop', permanent: true },
      { source: '/pages/customer-gallery', destination: '/styled-by-you', permanent: true },
      { source: '/troop', destination: '/styled-by-you', permanent: true },
      { source: '/pages/contact', destination: '/contact', permanent: true },
      { source: '/pages/jointhetroop', destination: '/#newsletter', permanent: true },
      { source: '/pages/bottom-size-chart', destination: '/size-guide', permanent: true },
      { source: '/pages/bundle-of-2', destination: '/size-guide', permanent: true },
      { source: '/policies/refund-policy', destination: '/returns', permanent: true },
      { source: '/policies/shipping-policy', destination: '/shipping', permanent: true },
      { source: '/policies/privacy-policy', destination: '/privacy', permanent: true },
      { source: '/policies/terms-of-service', destination: '/terms', permanent: true },
      { source: '/policies/contact-information', destination: '/contact-information', permanent: true },
      { source: '/account/login', destination: '/account/sign-in', permanent: false },
      { source: '/account/register', destination: '/account/sign-in', permanent: false },
    ];
  },
};

export default nextConfig;
