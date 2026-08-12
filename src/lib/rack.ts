/**
 * The horizontal rail.
 *
 * Expressed as Tailwind utilities rather than a custom CSS class, and that is
 * deliberate. A hand-written `.rack { display: flex }` in `@layer utilities`
 * sits *after* Tailwind's generated utilities in the stylesheet, so it silently
 * beat `md:grid` at every breakpoint and the desktop product grid never
 * applied — the rail just kept running off the right edge of a 1440px screen.
 * Variants are sorted after base utilities by design, so keeping every property
 * inside Tailwind's own ordering is what makes `RACK … md:grid` work at all.
 *
 * Children need `snap-start shrink-0`. Both are inert once the container becomes
 * a grid, so no `md:` override is required on the items.
 */
export const RACK = [
  'flex overflow-x-auto overscroll-x-contain',
  'snap-x snap-mandatory',
  // Keeps the first and last card aligned to the page gutter instead of jammed
  // against the glass when the rail is snapped.
  'scroll-px-(--spacing-gutter)',
  'no-scrollbar',
].join(' ');

/** Applied to each direct child of a `RACK` container. */
export const RACK_ITEM = 'snap-start shrink-0';
