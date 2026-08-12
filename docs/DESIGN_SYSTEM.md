# Design System

Tokens live in `src/app/globals.css` under Tailwind v4's `@theme`. Nothing here
is a component library — art direction comes first, and the primitives exist to
keep that direction consistent, not to make every page look like a demo.

## The 1.1 change: black became a contrast, not a background

1.0 committed to a single dark identity. On a real phone that turned the
homepage into one continuous black canvas: no hierarchy, no rhythm, and product
photography with nothing to sit against.

1.1 keeps black as a brand colour and demotes it from _default background_ to
_contrast_. The storefront now reads as a sequence of rooms — a bone hero, a
white product showroom, a black manifesto, a dark Vault — and scrolling it
should feel like moving between rooms in a store rather than down a page.

Two directions are being combined deliberately: the stark white product
experience of the original INFNITY storefront, which is where the photography
belongs, and the darker editorial identity of the rebuild, which is where the
brand speaks.

The storefront still does not follow the viewer's theme. `color-scheme: light`
is declared and `body` paints an explicit background; a `prefers-color-scheme`
variant would be a different brand, not a preference.

## Colour

### Raw materials

Absolute values, used where a colour is literally that colour.

| Token                   | Value     | Material                            |
| ----------------------- | --------- | ----------------------------------- |
| `--color-paper`         | `#ffffff` | Clean white — the product showroom  |
| `--color-bone`          | `#f6f3ed` | Warm white — the gallery wall       |
| `--color-concrete`      | `#e8e4db` | Structural mid-tone, image plates   |
| `--color-concrete-deep` | `#d2cdc2` | Plate edges, sunken concrete        |
| `--color-carbon`        | `#1b1b1b` | Raised panels inside dark rooms     |
| `--color-ink`           | `#111111` | Near-black — large dark rooms       |
| `--color-void`          | `#000000` | True black — the lights-out moments |
| `--color-graphite`      | `#6d6a63` | Muted text on light                 |
| `--color-smoke`         | `#8f8b84` | Muted text on dark                  |
| `--color-signal`        | `#e8281c` | Sale, error, active state           |
| `--color-signal-deep`   | `#b81c12` | Signal hover                        |

Two deliberate decisions:

**Ink, not void, carries the large dark rooms.** Flat true black over a whole
viewport reads as an absence rather than a surface. Void is reserved for the
moments that should feel like the lights went out — the manifesto and the
footer.

**`--color-signal` is used only where something is genuinely true** — a live
sale computed from a real compare-at price, a validation error, an active
control, a scroll position. The moment red becomes decoration it stops
signalling, and the storefront becomes a red-and-black gaming site.

### Semantic surface tokens

Everything a component renders resolves against the nearest `[data-surface]`
ancestor. A section declares which material it is made of and every card,
button, rule and caption inside it re-tones without a single prop being passed
down.

| Token                     | Resolves to                             |
| ------------------------- | --------------------------------------- |
| `--color-surface`         | The room's own material                 |
| `--color-surface-raised`  | A panel lifted off it                   |
| `--color-surface-sunken`  | A recess — image plates, loading states |
| `--color-fg`              | Primary text                            |
| `--color-fg-muted`        | Body copy                               |
| `--color-fg-faint`        | Eyebrows, meta, prices' compare-at      |
| `--color-line`            | Structural borders                      |
| `--color-hairline`        | Subtle dividers                         |
| `--color-field`           | Form field borders                      |
| `--color-inverse-surface` | The room's opposite — primary buttons   |
| `--color-inverse-fg`      | Text on that opposite                   |

The five rooms are `paper`, `bone`, `concrete`, `ink` and `void`.

`@theme inline` is what makes this work: it emits
`.bg-surface { background: var(--ui-surface) }` rather than baking in a fixed
value, so the token participates in the cascade instead of being resolved once
at build time.

`--ui-fg-faint` is held at a real contrast ratio rather than being dialled down
until it looks pretty. It carries eyebrows and compare-at prices, which are two
things on a product card a customer must be able to read.

### Tailwind v4 syntax

Custom-property utilities use the **parenthesis** form: `aspect-(--aspect-portrait)`,
`px-(--spacing-gutter)`, `ease-(--ease-brand)`.

Tailwind v3's `aspect-[--aspect-portrait]` shorthand was removed in v4 and now
emits invalid CSS _silently_. It is worth knowing what that failure looks like:
every product frame collapsed to zero height and every section lost its vertical
rhythm, with no build error and no console warning.

## Typography

Two families. Not six.

| Role               | Family      | Notes                                 |
| ------------------ | ----------- | ------------------------------------- |
| Campaign / display | **Anton**   | Uppercase, tight tracking, one weight |
| Everything else    | **Archivo** | 400–900, industrial grotesque         |

Anton carries statements — the hero, section headings, the Vault, the wordmark.
Archivo carries product information and all utility UI. The contrast between
them is the hierarchy; weight alone would not carry it.

The brand's oblique is applied through the `.oblique` utility and is reserved
for the wordmark and campaign statements. Product copy is never set in it. If
everything screams, nothing has emphasis.

Both families load via `next/font/google` with `display: swap`, self-hosted at
build time, and are exposed as CSS variables so no component hardcodes a family.

### Scale

Campaign sizes are fluid `clamp()` values, so "BE THE STATEMENT" fills the
viewport edge to edge at 360px and at 1920px with no breakpoint jump:

| Token              | Range           | Use                          |
| ------------------ | --------------- | ---------------------------- |
| `--text-statement` | 3rem → 10rem    | Hero, Vault, 404             |
| `--text-headline`  | 2rem → 4.5rem   | Section headings             |
| `--text-title`     | 1.5rem → 2.5rem | Product name, editorial lead |

Utility text uses Tailwind's fixed scale — fluid sizing below a certain size
makes interfaces feel unstable rather than responsive.

Small-caps labels use wide tracking, `0.16em`–`0.32em`, which is what makes them
read as considered rather than merely small.

## Spacing and rhythm

| Token               | Range          | Use                             |
| ------------------- | -------------- | ------------------------------- |
| `--spacing-section` | 4.5rem → 10rem | Vertical gap between rooms      |
| `--spacing-gutter`  | 1.25rem → 4rem | Horizontal page inset (`.edge`) |

Both are fluid. `.edge` is the single utility for page inset, so nothing hand-
rolls its own horizontal padding and drifts out of alignment. Rooms need
generous vertical space to read as separate rooms.

## Shape

Radius is effectively zero, with `--radius-control` (2px) on controls where a
fully hard corner reads as an unstyled input. Streetwear reads square; rounded
corners are what make a fashion site look like a SaaS dashboard.

## Media ratios

| Token                | Ratio | Use                        |
| -------------------- | ----- | -------------------------- |
| `--aspect-portrait`  | 3:4   | Product cards, PDP gallery |
| `--aspect-editorial` | 4:5   | Editorial and campaign     |
| `--aspect-campaign`  | 16:9  | Full-width breaks          |

Every photograph goes through `MediaFrame`, which owns the ratio, fades the
image in off a material plate, and renders a designed garment-tag state when
there is no photograph or the file 404s. Frames hold their ratio and images
`cover` them, so mixed source ratios never cause layout shift.

The no-photograph plate uses fixed colours rather than surface-relative ones. A
surface-relative plate resolved to concrete inside a concrete section and
vanished, taking the card's frame with it.

## Motion

One easing curve, `--ease-brand` (`cubic-bezier(0.16, 1, 0.3, 1)`) — a decisive
start with a soft settle. Durations: 200ms for state, 300ms for chrome, 700ms
for reveals and image cross-fades, 900ms for image scale.

Rules the codebase holds to:

- Transform and opacity only, so animation stays on the compositor.
- No scroll hijacking, no parallax, no infinite animation.
- Hover effects are enhancements; every card is complete without them, because
  a phone has no hover.
- Scroll reveals fire once and unobserve, and are forced visible under
  `prefers-reduced-motion` and under `<noscript>`. The animation is an
  enhancement over a fully rendered page, never the mechanism that makes content
  visible.

## Interaction states

Focus rings are `2px solid var(--color-signal)` with 2px offset. Red is the one
colour that carries enough contrast against bone _and_ against void, which
neither white nor black manages alone. Restyled, never removed.

Selected option values invert to the room's `inverse-surface`. Unavailable
values stay visible, struck through, with an `(unavailable)` note for screen
readers — a customer looking for a sold-out size needs to see that it exists and
is gone, not wonder whether the brand makes it at all.

Size and colour targets are 56px tall, comfortably above the 44px minimum, which
keeps the oversized fashion-oriented sizing personality of the legacy storefront.

## Breakpoints

Tailwind defaults. The meaningful thresholds:

| Width         | Behaviour                                                     |
| ------------- | ------------------------------------------------------------- |
| < 640px       | Single column, stacked hero CTAs, swipe gallery, product rail |
| 640px         | Two-column footer nav, chips wrap instead of scrolling        |
| 768px (`md`)  | PDP splits to gallery + sticky panel; the rail becomes a grid |
| 1024px (`lg`) | Desktop nav replaces the hamburger                            |
| 1280px (`xl`) | Four-column catalogue grid                                    |

390px is treated as a first-class canvas, not a compressed desktop. `body` has
`overflow-x: clip` as a backstop, and wide content scrolls inside its own
container so the page never scrolls sideways. Playwright asserts this on six
routes at both viewports, and the header is `sticky` rather than `fixed` so no
page has to guess its height in top padding.
