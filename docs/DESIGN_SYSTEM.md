# Design System

Tokens live in `src/app/globals.css` under Tailwind v4's `@theme`. Nothing here
is a component library — art direction comes first, and the primitives exist to
keep that direction consistent, not to make every page look like a demo.

## Theme commitment

The storefront is **dark, always**. It does not follow the viewer's theme.

The brand's foundation is black; a light variant would be a different brand. So
`prefers-color-scheme` is deliberately ignored, `color-scheme: dark` is
declared, and `body` paints an explicit background rather than inheriting one.

## Colour

| Token            | Value     | Use                                 |
| ---------------- | --------- | ----------------------------------- |
| `--color-void`   | `#050505` | Page ground, deepest surface        |
| `--color-ink`    | `#0c0c0c` | Raised panels, footer, drawers      |
| `--color-carbon` | `#151515` | Image placeholders, hover fills     |
| `--color-slate`  | `#1e1e1e` | Reserved for deeper nesting         |
| `--color-ash`    | `#2b2b2b` | Structural borders and dividers     |
| `--color-field`  | `#4c4c47` | Form field borders only             |
| `--color-bone`   | `#ece9e3` | Body text                           |
| `--color-paper`  | `#ffffff` | Headings, emphasis, primary buttons |
| `--color-smoke`  | `#8a8a86` | Secondary text                      |
| `--color-dim`    | `#5c5c58` | Eyebrows, meta, disabled            |
| `--color-signal` | `#e2482a` | Sale, error — nothing decorative    |

Two deliberate decisions:

**`--color-field` sits lighter than `--color-ash`.** At structural-border weight
an input is nearly invisible against the page, and a field a customer cannot see
is a field they will not fill in.

**`--color-signal` is used only where something is genuinely true** — a live
sale computed from a real compare-at price, or a validation error. A palette
this dark loses its authority the moment colour becomes decoration.

## Typography

Two families. Not six.

| Role               | Family      | Notes                                 |
| ------------------ | ----------- | ------------------------------------- |
| Campaign / display | **Anton**   | Uppercase, tight tracking, one weight |
| Everything else    | **Archivo** | 400–900, industrial grotesque         |

Anton carries statements — hero, section headings, the Vault, prices at display
size. Archivo carries product information and all utility UI. The contrast
between them is the hierarchy; weight alone would not carry it.

Both are loaded via `next/font/google` with `display: swap`, self-hosted at
build time, and exposed as CSS variables so no component hardcodes a family.

### Scale

Campaign sizes are fluid `clamp()` values, so "BE THE STATEMENT" fills the
viewport edge to edge at 360px and at 1920px with no breakpoint jump:

| Token              | Range           | Use                          |
| ------------------ | --------------- | ---------------------------- |
| `--text-statement` | 3.25rem → 11rem | Hero, Vault, 404             |
| `--text-headline`  | 2.25rem → 5rem  | Section headings             |
| `--text-title`     | 1.5rem → 2.5rem | Product name, editorial lead |

Utility text uses Tailwind's fixed scale — fluid sizing below a certain size
makes interfaces feel unstable rather than responsive.

Small caps labels (eyebrows, buttons, meta) use wide tracking, `0.14em`–`0.3em`,
which is what makes them read as considered rather than merely small.

## Spacing and rhythm

| Token               | Range         | Use                             |
| ------------------- | ------------- | ------------------------------- |
| `--spacing-section` | 4rem → 9rem   | Vertical gap between sections   |
| `--spacing-gutter`  | 1rem → 3.5rem | Horizontal page inset (`.edge`) |

Both are fluid. `.edge` is the single utility for page inset, so nothing hand-
rolls its own horizontal padding and drifts out of alignment.

## Shape

Radius is effectively zero: `--radius-none` for surfaces, `--radius-control`
(2px) for controls where a fully hard corner reads as an unstyled input.
Streetwear reads square; rounded corners are what make a fashion site look like
a SaaS dashboard.

## Media ratios

| Token                | Ratio | Use                        |
| -------------------- | ----- | -------------------------- |
| `--aspect-portrait`  | 3:4   | Product cards, PDP gallery |
| `--aspect-editorial` | 4:5   | Collection cards           |
| `--aspect-campaign`  | 16:9  | Collection heroes          |

Frames hold their ratio and images `cover` them, so mixed source aspect ratios
never cause layout shift between gallery shots.

## Motion

One easing curve, `--ease-brand` (`cubic-bezier(0.16, 1, 0.3, 1)`) — a decisive
start with a soft settle. Durations: 200ms for state, 300ms for chrome, 700ms
for image reveals and scale.

Rules the codebase holds to:

- No scroll hijacking, no parallax that fights the scrollbar.
- No infinite animation.
- Hover effects are enhancements; every card is complete without them, because
  a phone has no hover.
- `prefers-reduced-motion` collapses durations to ~0 rather than removing
  transitions, so state changes still register without animating.

## Interaction states

Focus rings are `2px solid var(--color-paper)` with 2px offset — restyled,
never removed. Disabled controls drop to `--color-ash`/`--color-dim` and always
carry an explanation nearby rather than being inert and unexplained.

Selected option values invert to paper-on-void. Unavailable values stay visible,
struck through, with an `(unavailable)` note for screen readers — a customer
looking for a sold-out size needs to see it exists and is gone.

## Breakpoints

Tailwind defaults. The meaningful thresholds:

| Width         | Behaviour                                                      |
| ------------- | -------------------------------------------------------------- |
| < 640px       | Single column, stacked hero CTAs, swipe gallery                |
| 640px         | Two-column footer nav                                          |
| 768px (`md`)  | PDP splits to two columns, gallery gains thumbnail rail        |
| 1024px (`lg`) | Desktop nav replaces hamburger, filter sidebar replaces drawer |
| 1280px (`xl`) | Four-column product grid                                       |

390px is treated as a first-class canvas, not a compressed desktop. `body` has
`overflow-x: clip` as a backstop, and wide content — tables, editorial rails —
scrolls inside its own container so the page never scrolls sideways. A
Playwright assertion enforces this on six routes at both viewports.
