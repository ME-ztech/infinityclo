import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    // Legacy INFNITY imagery is migrated into /public during import, so no
    // remote patterns are required to render the storefront. This entry exists
    // only so the importer's `--keep-remote` debugging mode can preview assets
    // before they are localised; production delivery is always local.
    remotePatterns: [{ protocol: 'https', hostname: 'cdn.shopify.com' }],
    formats: ['image/avif', 'image/webp'],
  },
  experimental: {
    optimizePackageImports: [],
  },
};

export default nextConfig;
