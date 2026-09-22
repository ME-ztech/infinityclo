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
 *
 * `min-w-0` is load-bearing, not tidiness. A rail's cards are `shrink-0` with a
 * definite width, so the rail's *min-content* width is the sum of all of them —
 * several times the viewport. `overflow-x: auto` scrolls that content but does
 * not stop it being reported upwards: put a rail inside a flex or grid item and
 * that item's automatic minimum size resolves to the whole sum, the track grows
 * to it, and the page itself becomes four screens wide. `min-w-0` at every
 * flex/grid boundary a rail sits behind is what keeps a scrollable rail from
 * widening the document. See ProductDetailView for the same guard one level up.
 */
export const RACK = [
  'flex min-w-0 overflow-x-auto overscroll-x-contain',
  // `overscroll-x-contain` keeps a swipe that runs out of rail from turning into
  // a page-level back-gesture or a horizontal document scroll.
  'snap-x snap-mandatory',
  'no-scrollbar',
].join(' ');

/**
 * Scroll padding for a rail that keeps the page gutter.
 *
 * Pairs with the rail's own `px-(--spacing-gutter)`: it moves the snap positions
 * inwards by the same amount, so a snapped card lands on the page's grid line
 * instead of against the glass. It is deliberately *not* part of `RACK` — a
 * full-bleed rail like the product gallery cancels the gutter and wants its
 * shots flush, and inheriting this offset left every swipe 16px short with a
 * sliver of the previous photograph still on screen.
 */
export const RACK_GUTTER = 'scroll-px-(--spacing-gutter)';

/** Applied to each direct child of a `RACK` container. */
export const RACK_ITEM = 'snap-start shrink-0';
