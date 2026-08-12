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

export const PRIMARY_NAV: readonly NavSection[] = [
  { label: 'New', href: '/shop?sort=newest' },
  { label: 'Shop', href: '/shop' },
  { label: 'Collections', href: '/collections' },
  { label: 'The Vault', href: '/vault' },
  { label: 'The Troop', href: '/troop' },
  { label: 'About', href: '/about' },
];

export const FOOTER_NAV: ReadonlyArray<{ heading: string; links: readonly NavLink[] }> = [
  {
    heading: 'Shop',
    links: [
      { label: 'All Products', href: '/shop' },
      { label: 'New Arrivals', href: '/shop?sort=newest' },
      { label: 'Collections', href: '/collections' },
      { label: 'The Vault', href: '/vault' },
    ],
  },
  {
    heading: 'Brand',
    links: [
      { label: 'About', href: '/about' },
      { label: 'The Troop', href: '/troop' },
      { label: 'Contact', href: '/contact' },
    ],
  },
  {
    heading: 'Support',
    links: [
      { label: 'FAQ', href: '/faq' },
      { label: 'Shipping', href: '/shipping' },
      { label: 'Returns', href: '/returns' },
      { label: 'Size Guide', href: '/faq#sizing' },
    ],
  },
  {
    heading: 'Account',
    links: [
      { label: 'Account', href: '/account' },
      { label: 'Orders', href: '/account/orders' },
      { label: 'Wishlist', href: '/account/wishlist' },
    ],
  },
];

export const LEGAL_NAV: readonly NavLink[] = [
  { label: 'Privacy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
];

/**
 * Social links are deliberately empty until the brand confirms its live
 * handles. Rendering a dead icon row would be worse than rendering none.
 * Tracked in docs/OPERATIONS_CONTENT_GAPS.md.
 */
export const SOCIAL_LINKS: ReadonlyArray<{ label: string; href: string }> = [];
