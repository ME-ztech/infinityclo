/**
 * Image loader.
 *
 * Product and campaign photography lives on the owner's Shopify CDN, which
 * resizes on request (`width`) and negotiates WebP/AVIF itself — so those images
 * are delivered straight from Shopify at the width each layout asks for, with
 * no server-side optimisation step. Local assets (the brand mark, moderated
 * community uploads) are served as-is.
 */
export default function shopifyImageLoader({ src, width, quality }: { src: string; width: number; quality?: number }): string {
  if (src.startsWith('https://cdn.shopify.com/') || src.startsWith('https://infinityclo.ca/cdn/')) {
    const url = new URL(src);
    url.searchParams.set('width', String(width));
    if (quality) url.searchParams.set('quality', String(quality));
    return url.toString();
  }
  return src;
}
