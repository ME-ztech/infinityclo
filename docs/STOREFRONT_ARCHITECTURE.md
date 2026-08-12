# Storefront Architecture

## Shape

A modular monolith. Next.js App Router, TypeScript strict, React server
components by default with client components only where interaction demands them.

```
src/
  domain/        Pure types and logic. No React, no Next, no storage.
  data/
    repositories.ts      Interfaces the UI depends on
    adapters/local/      Implementations over the imported JSON snapshot
    catalog/             The snapshot itself (empty until import)
    index.ts             Composition root
  components/    UI, grouped by surface
  lib/           Cart state, analytics, URL params, focus trap, site config
  app/           Routes, API handlers, sitemap, robots
scripts/         Legacy catalog importer
e2e/             Playwright journeys
```

## The dependency rule

Dependencies point inward: `app` → `components` → `lib` → `data` → `domain`.
`domain` imports nothing from the layers above it. That is what allows the
domain logic to be unit-tested without a DOM, a server, or a database.

## The repository seam

Components never touch a data source. They import repository _instances_ from
`src/data/index.ts`, typed against interfaces in `src/data/repositories.ts`.

```ts
import { catalogRepository } from '@/data';
const { products, facets } = await catalogRepository.listProducts({ filters, sort });
```

Phase 2 swaps the local adapters for PostgreSQL-backed ones by editing
`src/data/index.ts` alone. If a backend change ever requires editing a
component, this boundary has been violated.

Every repository method is async even where the local implementation is
synchronous — a sync signature would bake locality into every call site and
break the moment data moves over a network.

### Repositories

| Repository           | Phase 1                                      | Phase 2                     |
| -------------------- | -------------------------------------------- | --------------------------- |
| `CatalogRepository`  | JSON snapshot, in-process filter/sort/search | PostgreSQL + search service |
| `ContentRepository`  | JSON snapshot                                | CMS or DB                   |
| `ReviewRepository`   | returns `[]` — no reviews are fabricated     | verified-purchase reviews   |
| `CartRepository`     | localStorage identities, server pricing      | server-owned carts          |
| `CustomerRepository` | declared, unimplemented                      | auth + accounts             |
| `OrderRepository`    | declared, unimplemented                      | orders + fulfilment         |

## Data honesty

The single rule the model enforces: **an unconfirmed fact is `null`, never a
plausible default.**

`ProductSpecification` fields (materials, fit, care, construction, weight,
origin) are all nullable. The UI omits a section rather than rendering a
placeholder or a guess. `SizeGuide` measurements are nullable and render as "—"
under a pending notice. `InventoryDisplayState` is a display state, not a count,
so the storefront cannot imply scarcity it has not verified.

## Cart and pricing

The client persists **identities only** — product slug, variant id, quantity.
No money is stored in the browser.

```
localStorage ──► useSyncExternalStore ──► POST /api/cart/resolve ──► priced Cart
   (identities)                              (server-side lookup)
```

`localStorage` is modelled as the external system it is, consumed via
`useSyncExternalStore` with a stable server snapshot. Three consequences:

- Hydration matches exactly; no flash of an empty or wrong cart.
- `storage` events are forwarded, so two open tabs stay in sync.
- A tampered localStorage value cannot influence what anything costs, because
  every price is resolved from the catalog server-side.

Hydration state and "pricing in flight" are _derived_, not tracked, so they
cannot drift from the request that produced them. The header badge counts from
the persisted cart rather than the priced one, so it is correct on first paint
instead of after a round trip.

## Checkout boundary

`src/domain/checkout.ts` documents the intended flow and, critically, encodes
that an `Order` may be created **only** from a signature-verified payment event
that arrived server-side.

```
Cart → CheckoutSession → InventoryReservation → Payment
     → VerifiedPaymentEvent → Order → Fulfilment
```

Phase 1 ships no payment capability. `CHECKOUT_ENABLED` is false, the checkout
control renders disabled with an explicit notice, and there is no
client-callable path from cart to order — not even a stubbed one. The preview
banner states the same thing at the top of every page.

## Rendering strategy

| Route                                     | Strategy                       | Why                               |
| ----------------------------------------- | ------------------------------ | --------------------------------- |
| `/`, `/collections`, `/vault`, `/troop`   | Static, 1h revalidate          | Catalog-driven, changes on import |
| `/products/[slug]`, `/collections/[slug]` | SSG via `generateStaticParams` | Pre-rendered per product          |
| `/shop`, `/search`                        | Dynamic                        | Depend on query params            |
| Policy, about, account                    | Static                         | No data dependency                |
| `/api/*`                                  | Dynamic                        | Request-scoped                    |

## Client/server split

Server components fetch and render; the catalog never ships to the browser.
Client components are limited to those that genuinely need interaction: header,
mobile nav, search overlay, cart provider and drawer, product gallery, buy
panel, shop controls, Troop gallery, forms.

`ProductDetailView` exists only to let the buy panel drive the gallery on a
colour change, keeping the page itself a server component.

## Accessibility

One shared `useFocusTrap` serves every overlay: focus trapping, restore on
close, Escape handling, and scroll locking that compensates for scrollbar width
so the page behind does not shift.

Beyond that: one `h1` per route, semantic landmarks, a skip link as the first
focus stop, visible focus rings that are restyled but never removed, decorative
content marked `aria-hidden`, 44px minimum touch targets, and reduced-motion
handling that collapses animation without hiding content.

## Analytics

One typed event union and a sink registry in `src/lib/analytics.ts`. No provider
SDK appears in a component. Sinks are isolated so a failing analytics provider
can never break a purchase. No credentials are needed to build or run.

## Testing

- **Vitest** covers the domain logic, URL params, cart storage validation, the
  checkout boundary, and form behaviour — no DOM server required.
- **Playwright** covers journeys at 1440px desktop and Pixel 7 mobile, against a
  production build rather than the dev server.
- Catalog-dependent journeys are written in full and skip while the snapshot is
  empty. They are not seeded with invented products: a green add-to-cart test
  over fake data would assert something untrue.
