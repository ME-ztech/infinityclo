# INFNITY — storefront and back office

The headless storefront and branded back office for **Infnity.clo**
(infinityclo.ca). Shopify stays the system of record for the catalogue,
inventory, customers, orders, checkout, payments, taxes and fulfilment; this
app is the customer-facing site and the owner's operating console on top of it.

Next.js 16 · React 19 · TypeScript strict · Tailwind 4 · Drizzle (Postgres / PGlite) · Vitest · Playwright.

## Start here

| Document                                                             | For                                                                                          |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [`docs/launch-checklist.md`](docs/launch-checklist.md)               | What is ready, what needs the owner, exact Shopify setup steps                               |
| [`docs/admin-operator-guide.md`](docs/admin-operator-guide.md)       | How to add a product, restock, run a discount, edit the hero, fulfil, handle returns, export |
| [`docs/architecture-decision.md`](docs/architecture-decision.md)     | Why Shopify stays the system of record; data ownership; API/webhook map                      |
| [`docs/source-audit.md`](docs/source-audit.md)                       | What was found on the live store, Instagram and the references                               |
| [`docs/feature-matrix.md`](docs/feature-matrix.md)                   | Every requested feature: implemented / tested / limitations                                  |
| [`docs/test-evidence.md`](docs/test-evidence.md)                     | Exact test results, real vs simulated                                                        |
| [`docs/deployment-and-rollback.md`](docs/deployment-and-rollback.md) | Staging, production cutover, DNS, rollback                                                   |
| [`docs/assets-and-rights.md`](docs/assets-and-rights.md)             | Image rights and the assets still needed                                                     |

## Run it locally

```bash
npm ci
npm run dev                      # http://localhost:3000 (local PGlite database)
```

Create a back-office owner, then sign in at `/admin`:

```bash
OWNER_EMAIL=you@example.com npm run admin:create-owner
```

With no environment variables the site runs on the imported snapshot of the
live catalogue, checkout shows as not connected, and Shopify-backed admin
screens are read-only with an explanation. Configure Shopify and Postgres via
`.env.example`.

| Script                                            |                                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `npm run build` / `npm start`                     | Production build / serve                                                              |
| `npm run typecheck` · `npm run lint` · `npm test` | Static checks and 130 unit/integration tests                                          |
| `npx playwright test`                             | 100 end-to-end tests (desktop + Pixel 7) — build first with `CHECKOUT_MODE=permalink` |
| `npm run import:catalog`                          | Re-import products/photos from infinityclo.ca (CA market, CAD)                        |
| `npm run import:content`                          | Re-import published policies and the community wall                                   |
| `npm run db:generate`                             | Generate SQL migrations after editing `src/server/db/schema.ts`                       |
| `npm run admin:create-owner`                      | Create the first owner account                                                        |

## Layout

```
src/app/(store)/     Storefront routes (home, shop, products, cart, account, content pages)
src/app/admin/       Back office (RBAC-guarded) and CSV exports
src/app/api/         Checkout hand-off, cart pricing, forms, webhooks
src/domain/          Pure logic: money, products, promotions, order status, RBAC, CMS schemas
src/server/          Server-only: Shopify clients, DB, auth, services, security
src/data/            Catalogue repositories (Shopify Storefront API or imported snapshot)
src/components/      UI by surface
scripts/             Importers and the owner CLI
e2e/                 Playwright suites
```

## Rules the code holds to

- **No invented facts.** Unknown garment facts, dates or measurements render as "not published yet", never as a guess.
- **No client-side money.** The browser holds cart identities only; every price is resolved on the server and Shopify computes the final total.
- **No fake integrations.** A Shopify-backed screen without credentials says so and disables its writes.
- **Drafts until approved.** Promotions reach shoppers only after owner approval _and_ a real Shopify discount exists.
- **Consent is explicit.** Marketing email, waitlists and community photos each require an unticked box; the wording and time are stored.
