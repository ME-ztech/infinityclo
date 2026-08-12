import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    /**
     * Product photography is downloaded into `public/products/` by
     * `scripts/import-infnity-catalog.ts`, so the storefront normally serves
     * every image from its own origin and needs no remote host at all.
     *
     * This entry is the safety net for the importer's `remote-fallback` path:
     * when a single asset cannot be written locally the product keeps its source
     * URL so the customer still sees the garment rather than a blank plate.
     * Those cases are listed in docs/ASSET_PROVENANCE.md and are meant to be
     * re-imported, not left in place — but a missing remote pattern would turn
     * one failed download into a hard 500 on the product page, which is a far
     * worse outcome than one hotlinked image.
     */
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.shopify.com' },
      { protocol: 'https', hostname: 'infinityclo.ca' },
    ],
    formats: ['image/avif', 'image/webp'],
    /**
     * Trimmed to the widths this layout actually requests. The rack card is
     * ~82vw on a phone and catalogue cards are ~24vw on a wide desktop; without
     * this, Next generates and caches variants no breakpoint here ever asks for.
     */
    deviceSizes: [390, 430, 640, 828, 1080, 1200, 1600, 1920],
    imageSizes: [64, 96, 128, 200, 256, 384],
  },
};

export default nextConfig;
