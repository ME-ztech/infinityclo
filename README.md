# INFNITY — Digital Flagship Storefront

A ground-up commerce storefront for INFNITY. Next.js 16, React 19, TypeScript
strict, Tailwind v4. Frontend-first by design: the storefront is complete and
deployable, with typed seams where the commerce backend will land.

> **Preview build.** No payment provider is connected. Checkout is disabled, no
> order can be placed, and the deployed site says so on every page.

> **The committed catalog is empty.** The development environment cannot reach
> the legacy store, so nothing could be imported there — and nothing was
> invented to stand in for it. A `prebuild` step imports the real catalog and
> photography during deployment, where the source _is_ reachable, and falls back
> to honest empty states if it is not. See
> [`docs/LEGACY_BRAND_AUDIT.md`](docs/LEGACY_BRAND_AUDIT.md).

## Quick start

```bash
npm ci
npm run dev          # http://localhost:3000
```

| Script                  | What it does                                         |
| ----------------------- | ---------------------------------------------------- |
| `npm run dev`           | Development server                                   |
| `npm run build`         | Production build                                     |
| `npm start`             | Serve the production build                           |
| `npm run typecheck`     | `tsc --noEmit`                                       |
| `npm run lint`          | ESLint                                               |
| `npm test`              | Vitest unit and component tests                      |
| `npm run e2e`           | Playwright, against a production build               |
| `npm run format`        | Prettier                                             |
| `npm run import:legacy` | Import the catalog and imagery from the legacy store |

No environment variables are required to build or run. See
[`docs/VERCEL_DEPLOYMENT.md`](docs/VERCEL_DEPLOYMENT.md) for the optional ones.

## Importing the real catalog

This is the one step that turns the storefront from a working shell into a
working store.

```bash
npm run import:legacy
```

It reads the legacy store **once**, normalises the catalog into the domain
model, downloads imagery into `public/assets/`, writes the snapshot into
`src/data/catalog/`, and regenerates `docs/ASSET_PROVENANCE.md`.

It requires network access to `infinityclo.ca` and `cdn.shopify.com`, which this
environment currently denies. If the host is unreachable it writes nothing
rather than leaving a partial catalog behind.

The storefront never contacts the legacy site at runtime.

## Routes

```
/                     Homepage — hero, drop, editorial, Vault, essentials, Troop
/shop                 Catalog with faceted filters and sort, URL-persisted
/collections          All collections
/collections/[slug]   Single collection
/products/[slug]      Product detail
/search               Search results
/cart                 Full cart
/vault                The archive
/troop                Styled By You — customer gallery
/about                Brand story
/contact /faq /shipping /returns /privacy /terms
/account /account/orders /account/wishlist
```

## How this codebase is organised

```
src/domain/      Types and pure logic. No React, no Next, no storage.
src/data/        Repository interfaces + local adapters + composition root
src/components/  UI by surface
src/lib/         Cart, analytics, URL params, focus trap, site config
src/app/         Routes and API handlers
scripts/         Legacy importer
e2e/             Playwright journeys
```

Components depend on repository _interfaces_, never on a data source. Phase 2
swaps `src/data/index.ts` for PostgreSQL adapters without touching the UI.
[`docs/STOREFRONT_ARCHITECTURE.md`](docs/STOREFRONT_ARCHITECTURE.md) has the detail.

## Two rules the code holds to

**An unconfirmed fact is `null`, never a plausible default.** Materials, fit,
care, weight, origin and garment measurements are all nullable. The UI omits a
section rather than rendering a guess. A customer orders against these.

**Browser state can never represent a payment.** The cart persists identities
only — slug, variant, quantity — and every price is resolved server-side, so a
tampered `localStorage` value cannot change what anything costs. There is no
client-callable path from cart to order, not even a stubbed one.

## Documentation

| Document                                                            | Contents                                                       |
| ------------------------------------------------------------------- | -------------------------------------------------------------- |
| [`LEGACY_BRAND_AUDIT.md`](docs/LEGACY_BRAND_AUDIT.md)               | What was and was not recoverable from the legacy site, and why |
| [`STOREFRONT_ARCHITECTURE.md`](docs/STOREFRONT_ARCHITECTURE.md)     | Layers, seams, cart and checkout design, rendering strategy    |
| [`DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md)                         | Colour, type, spacing, motion, breakpoints                     |
| [`ASSET_PROVENANCE.md`](docs/ASSET_PROVENANCE.md)                   | Where every asset came from; regenerated by the importer       |
| [`BRAND_STORY_INPUTS_NEEDED.md`](docs/BRAND_STORY_INPUTS_NEEDED.md) | Questions for the founder, in priority order                   |
| [`OPERATIONS_CONTENT_GAPS.md`](docs/OPERATIONS_CONTENT_GAPS.md)     | What must be confirmed before taking orders                    |
| [`VERCEL_DEPLOYMENT.md`](docs/VERCEL_DEPLOYMENT.md)                 | Deployment settings and environment variables                  |
| [`PHASE_2_COMMERCE_BACKEND.md`](docs/PHASE_2_COMMERCE_BACKEND.md)   | The next phase, sliced and sequenced                           |

## Testing

Unit tests cover the domain logic, URL parsing, cart storage validation, the
checkout boundary and form behaviour. Playwright covers storefront journeys at
1440px and Pixel 7 against a production build.

Catalog-dependent journeys are written in full and skip while the snapshot is
empty. They are not seeded with invented products — a green add-to-cart test
over fake data would assert something untrue.

```bash
npm test && npm run e2e
```
