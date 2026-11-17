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

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? 'https://infinityclo.ca';

/**
 * Preview mode. The public build has no payment infrastructure, so checkout is
 * disabled and the storefront says so plainly rather than presenting a buy flow
 * that cannot complete. Phase 2 flips this by wiring a real payment provider.
 */
/** @deprecated Checkout mode is resolved server-side; see src/server/shopify/config.ts. */
export const CHECKOUT_ENABLED = process.env.NEXT_PUBLIC_CHECKOUT_ENABLED === 'true';

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

/** Desktop left-hand navigation, per the owner's notes: Home · Shop · Styled By You · Contact. */
export const PRIMARY_NAV: readonly NavSection[] = [
  { label: 'Home', href: '/' },
  { label: 'Shop', href: '/shop' },
  { label: 'Styled By You', href: '/styled-by-you' },
  { label: 'Contact', href: '/contact' },
];

export const FOOTER_NAV: ReadonlyArray<{ heading: string; links: readonly NavLink[] }> = [
  {
    heading: 'Shop',
    links: [
      { label: 'Shop all', href: '/shop' },
      { label: 'New arrivals', href: '/shop?sort=newest' },
      { label: 'Tops & tees', href: '/shop?group=tops' },
      { label: 'Hoodies', href: '/shop?group=hoodies' },
      { label: 'Bottoms & jorts', href: '/shop?group=bottoms' },
      { label: 'Accessories', href: '/shop?group=accessories' },
      { label: 'Coming soon', href: '/coming-soon' },
    ],
  },
  {
    heading: 'Brand',
    links: [
      { label: 'Our story', href: '/about' },
      { label: 'Styled By You', href: '/styled-by-you' },
      { label: 'Lookbook', href: '/lookbook' },
      { label: 'Contact', href: '/contact' },
    ],
  },
  {
    heading: 'Help',
    links: [
      { label: 'Size guide', href: '/size-guide' },
      { label: 'Shipping', href: '/shipping' },
      { label: 'Returns & exchanges', href: '/returns' },
      { label: 'Track an order', href: '/account/orders' },
      { label: 'FAQ', href: '/faq' },
    ],
  },
  {
    heading: 'Account',
    links: [
      { label: 'Sign in / account', href: '/account' },
      { label: 'Orders', href: '/account/orders' },
      { label: 'Wishlist', href: '/account/wishlist' },
    ],
  },
];

export const LEGAL_NAV: readonly NavLink[] = [
  { label: 'Privacy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
  { label: 'Contact information', href: '/contact-information' },
];

/**
 * Only handles verified from the brand's own Instagram profile (screenshot 05)
 * and its link-in-bio. The Facebook page name is known but its URL could not be
 * verified from this environment, so it is configured in Admin → Settings.
 */
export const SOCIAL_LINKS: ReadonlyArray<{ label: string; href: string }> = [
  { label: 'Instagram', href: 'https://www.instagram.com/infnity.clo/' },
  { label: 'Threads', href: 'https://www.threads.net/@infnity.clo' },
];
