/**
 * Brand and site constants.
 *
 * Brand naming is centralised here because the legacy store spells the name
 * inconsistently — the wordmark reads "INFNITY" while the domain and some copy
 * read "Infinity". The rebuild standardises on INFNITY as the brand name and
 * keeps infinityclo.ca as the domain, so nothing in the codebase has to guess.
 * See docs/LEGACY_BRAND_AUDIT.md.
 */

export const BRAND = {
  name: 'INFNITY',
  legalName: 'INFNITY',
  /** Lowercase social/product handle as used by the brand. */
  handle: 'infnity.clo',
  tagline: 'Be the Statement',
  domain: 'infinityclo.ca',
} as const;

const DEFAULT_SITE_URL = 'https://infinityclo.ca';

/**
 * Turns whatever was configured into a usable absolute origin. A value without
 * a scheme ("infinityclo.ca") gets https://; anything that still is not a URL
 * falls back to the default. A typo in an environment variable must never be
 * able to fail a build or break every canonical link.
 */
export function resolveSiteUrl(configured: string | undefined, fallback = DEFAULT_SITE_URL): string {
  const value = configured?.trim();
  if (!value) return fallback;
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    if (!url.hostname.includes('.') && url.hostname !== 'localhost') return fallback;
    return url.origin;
  } catch {
    return fallback;
  }
}

export const SITE_URL = resolveSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);

/**
 * Checkout switch. Whether an order can actually be taken is decided on the
 * server (database, payment provider and a shipping rate must exist); this is
 * on by default. Set NEXT_PUBLIC_CHECKOUT_ENABLED=false to turn the storefront
 * into a browse-only preview (for example on a design-review deployment).
 */
export const CHECKOUT_ENABLED = process.env.NEXT_PUBLIC_CHECKOUT_ENABLED !== 'false';

export interface NavLink {
  readonly label: string;
  readonly href: string;
  readonly description?: string;
}

export interface NavSection {
  readonly label: string;
  readonly href: string;
  /** Populated at render time from the catalog for collection-driven menus. */
  readonly children?: readonly NavLink[];
}

/** The primary menu, exactly as the owner specified it. */
export const PRIMARY_NAV: readonly NavSection[] = [
  { label: 'Home', href: '/' },
  { label: 'Shop', href: '/shop' },
  { label: 'Styled By You', href: '/community' },
  { label: 'Contact', href: '/contact' },
];

export const FOOTER_NAV: ReadonlyArray<{ heading: string; links: readonly NavLink[] }> = [
  {
    heading: 'Shop',
    links: [
      { label: 'Shop All', href: '/shop' },
      { label: 'New Arrivals', href: '/shop?sort=newest' },
      { label: 'Size Guide', href: '/size-guide' },
      { label: 'Styled By You', href: '/community' },
    ],
  },
  {
    heading: 'Brand',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Contact', href: '/contact' },
      { label: 'FAQ', href: '/faq' },
    ],
  },
  {
    heading: 'Account',
    links: [
      { label: 'Account', href: '/account' },
      { label: 'Order Tracking', href: '/account/orders' },
      { label: 'Wishlist', href: '/account/wishlist' },
    ],
  },
  {
    heading: 'Policies',
    links: [
      { label: 'Shipping', href: '/shipping' },
      { label: 'Returns', href: '/returns' },
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
    ],
  },
];

export const LEGAL_NAV: readonly NavLink[] = [
  { label: 'Privacy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
];

/** The brand's verified Instagram handle, as linked from infinityclo.ca. */
export const INSTAGRAM_HANDLE = '@infnity.clo';
export const INSTAGRAM_URL = 'https://www.instagram.com/infnity.clo/';
