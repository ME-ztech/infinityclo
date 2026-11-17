# INFNITY — Commerce Platform

INFNITY's own storefront, checkout, customer accounts and back office.
Next.js 16, React 19, TypeScript strict, Tailwind v4, PostgreSQL (Drizzle),
Stripe.

The platform owns its data and its rules: catalogue, stock, customers, orders
and discounts live in INFNITY's database. Stripe moves money; nothing depends on
Shopify at runtime. Shopify is a migration source only.

> **Status: ready for staging UAT, not for live orders.** The platform's logic
> is built and tested (267 unit/integration tests, 90 browser tests). Payments
> have only been exercised with a simulated provider — the Stripe integration
> has never been run against Stripe. See
> [`docs/production-readiness.md`](docs/production-readiness.md).

## Quick start

```bash
npm ci
```

```bash
npm run admin:setup -- you@example.com
```

```bash
npm run dev
```

- Storefront: `http://localhost:3000`
- Back office: `http://localhost:3000/admin`

No database to install: development uses an embedded PostgreSQL under `./.data`
and imports the real catalogue on first run. To try checkout with simulated
payments, add `PAYMENTS_PROVIDER=test` to `.env.local` and add a shipping rate
in Admin → Settings. See [`.env.example`](.env.example).

## Scripts

| Script | What it does |
| ------ | ------------ |
| `npm run dev` / `build` / `start` | Develop, build, serve |
| `npm run typecheck` / `lint` / `test` | Static checks; unit and integration tests |
| `npm run e2e` | Browser tests against a production build (`PW_CHANNEL=chrome` to use installed Chrome) |
| `npm run admin:setup -- <email>` | Create the admin owner account for this environment |
| `npm run db:generate` | Generate a migration after editing the schema |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` |
| `npm run db:seed` | Import the catalogue snapshot (idempotent) |
| `npm run db:status` | Row counts; variants still without a counted quantity |
| `npm run db:inventory -- <csv>` | Apply counted stock from an inventory export |
| `npm run migrate:customers -- <csv> [--dry-run]` | Import customers from a Shopify export |
| `npm run migrate:orders -- <csv> [--dry-run]` | Import order history from a Shopify export |
| `npm run migrate:reconcile` | Figures to hold against Shopify's own |
| `npm run import:catalog` | Refresh the catalogue snapshot from the legacy store |

## How the code is organised

```
src/domain/          Pure logic: money, pricing, offers, products, taxonomy
src/server/db/       Schema, connection, ids
src/server/commerce/ The engine: catalogue, inventory, checkout, payments,
                     orders, customers, emails, migration
src/server/admin/    Staff auth, permissions, gateway over the engine
src/server/          Config, security, document store, content, records
src/data/            Repository seam the storefront reads through
src/app/             Routes: storefront, checkout, account, admin, API
src/components/      UI by surface
drizzle/             SQL migrations
scripts/             Database, migration, setup and import tools
e2e/                 Browser tests
```

## Rules the code holds to

1. **The server prices everything.** The browser sends variant ids and
   quantities; money is integer cents and never comes from the client.
2. **Stock is reserved at checkout** by a conditional update, so the last unit
   cannot be sold twice.
3. **An order is created in one place** — the handler for a signature-verified
   payment webhook whose amount matches the checkout.
4. **Everything that moves money or stock is idempotent.**
5. **An unconfirmed fact is `null`, never a plausible default.** Fit, fabric,
   care and measurements are omitted until the brand supplies them.
6. **Nothing simulated is called production-ready.** The test payment provider
   cannot be enabled on a production deployment.

## Documentation

| Document | Contents |
| -------- | -------- |
| [`architecture-decision.md`](docs/architecture-decision.md) | The Shopify-independent architecture and why |
| [`data-model.md`](docs/data-model.md) | Schema and commerce-domain design |
| [`migration-plan.md`](docs/migration-plan.md) | Shopify migration, reconciliation, rollback |
| [`development-plan.md`](docs/development-plan.md) | What was reused, what is done, what remains |
| [`production-readiness.md`](docs/production-readiness.md) | Checklist: ready, owner action, to do |
| [`build-vs-shopify.md`](docs/build-vs-shopify.md) | Cost, complexity and timeline, honestly |
| [`deployment-and-rollback.md`](docs/deployment-and-rollback.md) | Environments, variables, deploy, recover |
| [`admin-operator-guide.md`](docs/admin-operator-guide.md) | How to run the store day to day |
| [`test-evidence.md`](docs/test-evidence.md) | Exactly what was tested, and what was simulated |
| [`feature-matrix.md`](docs/feature-matrix.md) | Every requested feature and its state |
| [`source-audit.md`](docs/source-audit.md) | What was found on the legacy store and references |
| [`assets-and-rights.md`](docs/assets-and-rights.md) | Asset inventory, rights, missing-asset requests |
| [`DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) | Colour, type, spacing, motion |
