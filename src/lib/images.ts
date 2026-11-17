/**
 * Where an image may be served from.
 *
 * Two sources only: a file on this site, or an https URL on a host the
 * deployment has opted into with NEXT_PUBLIC_IMAGE_HOSTS (for example the
 * public domain of an object-storage bucket). The same list feeds the image
 * optimiser and the Content-Security-Policy in `next.config.ts`, so an image
 * accepted here is one the page is actually allowed to display.
 */
const LOCAL_IMAGE = /^\/(?!\/)[\w./-]+\.(?:jpe?g|png|webp|avif)$/i;

export function allowedImageHosts(configured: string | undefined = process.env.NEXT_PUBLIC_IMAGE_HOSTS): string[] {
  return (configured ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter((host) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host));
}

/** The URL if it may be displayed, otherwise null. */
export function allowedImageUrl(value: unknown, hosts: readonly string[] = allowedImageHosts()): string | null {
  if (typeof value !== 'string') return null;
  const url = value.trim();
  if (LOCAL_IMAGE.test(url) && !url.includes('..')) return url;
  if (!/^https:\/\/[^\s"'<>]+$/i.test(url)) return null;
  try {
    return hosts.includes(new URL(url).hostname.toLowerCase()) ? url : null;
  } catch {
    return null;
  }
}

export const IMAGE_URL_HELP =
  'Enter the path of an image on this site (for example /products/my-product/01.jpg). Images hosted elsewhere must be on a host listed in NEXT_PUBLIC_IMAGE_HOSTS.';
