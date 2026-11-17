# Architecture Decision

**Decision (revised 2026-11-16): INFNITY owns its commerce platform. Catalogue,
inventory, customers, checkout, orders, discounts and content live in INFNITY's
own PostgreSQL database and are governed by code in this repository. Stripe
moves money. Shopify is a temporary migration source and nothing at runtime
depends on it.**

This supersedes the decision recorded earlier the same day, which kept Shopify
as the permanent system of record. That decision was sound for its stated goal
(lowest-risk relaunch) and wrong for the owner's actual goal (own the platform).
The owner's correction is the authority here.

## What changed, and what it cost

| | First decision | This decision |
| --- | --- | --- |
| System of record | Shopify | INFNITY's PostgreSQL |
| Checkout | Shopify-hosted | On-site, Stripe Payment Element |
| Customer login | Shopify Customer Account API | INFNITY accounts (email + password) |
| Admin | Dashboard over Shopify's Admin API | Dashboard over INFNITY's database |
| Tax, shipping rates | Shopify computes | INFNITY computes from its own rate tables |
| Refunds, cancellation | Done in Shopify | Done here, through Stripe |

Removed from the codebase: the Shopify admin gateway, Shopify customer OAuth,
the live Storefront API catalogue adapter and the Shopify webhook route. Kept:
the importers that read Shopify's exports.

The trade is deliberate and has a price, set out honestly in
`build-vs-shopify.md`: INFNITY now carries responsibilities Shopify carried —
tax correctness, fraud and chargebacks, uptime, security patching, backups.

## Why the earlier PostgreSQL + Stripe plan was rejected, and why it now applies

The repository's original plan (`PHASE_2_COMMERCE_BACKEND.md`, now deleted) was
PostgreSQL + Stripe + hand-rolled accounts. It was rejected on the assumption
that the store should stay on Shopify, where a second backend would have meant
two inventories that could disagree. With Shopify leaving, that objection
disappears: there is again exactly one system of record. The plan's shape was
right; what was built follows it, with these differences:

| Original plan | Built |
| --- | --- |
| "Drizzle or Prisma" | **Drizzle.** See below. |
| Stripe Checkout or Payment Element | **Payment Element**, so checkout stays on-site and on-brand |
| Auth.js or hand-rolled sessions | Hand-rolled: a session table, hashed tokens, scrypt |
| Slices delivered over time | Delivered together, behind one schema |

### Drizzle rather than Prisma

The owner's note said "PostgreSQL + Prisma — reinstate, subject to repo audit".
The audit found Prisma was never installed; the plan named it only as an option.
Drizzle was chosen for one decisive reason: it runs unchanged on **PGlite**,
PostgreSQL compiled to WebAssembly. That gives:

- a working store on `npm run dev` with no database to install;
- an integration test suite that executes real PostgreSQL — real constraints,
  real transactions, real `SELECT … FOR UPDATE` — in memory, in seconds;
- migrations as reviewable SQL files (`drizzle/`).

Prisma needs a query-engine binary and a running server for the same tests. If
the owner prefers Prisma for hiring or familiarity, the schema maps one-to-one
and the swap is contained to `src/server/db` and the query modules in
`src/server/commerce`.

## Target architecture

```
                ┌──────────────────────────────────────────────────────────┐
  Customer ────►│  Storefront (Next.js, this repo)                          │
                │  home · shop · product · cart · checkout · account        │
                └───────┬─────────────────────────────────┬────────────────┘
                        │                                 │ card details go
                        ▼                                 ▼ browser → Stripe
        ┌───────────────────────────────┐          ┌─────────────┐
        │  INFNITY commerce engine       │◄─────────│   Stripe    │
        │  src/server/commerce           │ signed   │ (payments)  │
        │                                │ webhook  └─────────────┘
        │  catalog    inventory          │
        │  checkout   orders             │          ┌─────────────┐
        │  customers  discounts          │─────────►│   Resend    │
        │  payments   migration          │  email   │  (email)    │
        └───────┬───────────────────────┘          └─────────────┘
                │
                ▼
        ┌───────────────────────────────┐
        │  PostgreSQL (Neon or any)      │   one database, one backup
        │  relational commerce tables    │
        │  + documents (content, drafts, │
        │    consent, tickets, audit)    │
        └───────▲───────────────────────┘
                │
  Staff ───────►│  /admin  (RBAC, audit log)  — same engine, same rules
```

Third parties and what each is allowed to own:

| Service | Role | Owns business logic? | Replaceable by |
| --- | --- | --- | --- |
| PostgreSQL host (e.g. Neon) | Stores data | No | Any PostgreSQL |
| Stripe | Moves money, holds card data | No — amount, order and refund rules are ours | Any provider behind `PaymentProvider` |
| Resend | Delivers email | No — templates and triggers are ours | Any SMTP/API sender |
| Vercel | Runs the app | No | Any Node host |
| Shopify | Migration source only | No | — |

## Data ownership

Every row below lives in INFNITY's database. There is no field two systems
both write.

| Data | Table(s) | Written by |
| --- | --- | --- |
| Products, variants, options, media | `products`, `product_variants`, `product_options`, `product_media` | Admin |
| Collections | `collections`, `collection_products` | Admin |
| Stock | `inventory_levels`, `inventory_movements`, `inventory_reservations` | Checkout, fulfilment, admin |
| Customers and sign-in | `customers`, `customer_sessions`, `customer_tokens`, `customer_addresses` | Customer |
| Carts | Browser for guests; `carts`, `cart_items` reserved for signed-in sync | Customer |
| Checkouts | `checkouts` | Checkout engine |
| Orders | `orders`, `order_items`, `order_events` | Payment webhook, admin |
| Money movements | `payments` | Payment webhook, refund action |
| Shipments | `fulfillments` | Admin |
| Discounts | `discounts`, `discount_redemptions` | Admin (activation), checkout |
| Shipping and tax rates | `shipping_rates`, `tax_rates` | Admin |
| Content, offer drafts, drops, waitlists, consent records, tickets, staff, audit | `documents` | Admin, public forms |
| Webhook receipts | `webhook_events` | Payment webhook |

Card numbers are never stored, logged or seen by this application.

## The rules the engine enforces

These are the properties that make it safe to take money. Each is covered by
tests named in `test-evidence.md`.

1. **The server prices everything.** The browser sends variant ids and
   quantities. Prices, shipping, tax and discounts are computed from the
   database (`src/domain/pricing.ts`, integer cents only).
2. **Stock is reserved when checkout opens.** A single conditional `UPDATE`
   decides who gets the last unit; reservations expire after 30 minutes and are
   released.
3. **An order is created in exactly one place** — the handler for a
   signature-verified payment webhook whose amount equals the frozen checkout
   total. No page, redirect or client call can create or mark an order paid.
4. **Everything is idempotent.** Webhook event ids are a primary key; an order
   is unique per checkout and per payment reference; refunds carry an
   idempotency key to both Stripe and the database.
5. **Status is derived, never asserted.** Fulfilment and payment status come
   from recorded quantities and cents. "Delivered" requires a recorded delivery.
6. **A customer can only reach their own data.** The customer id is in the
   `WHERE` clause of every account query.
7. **Consent is explicit and recorded.** Marketing consent is its own field with
   time and source; an account or an order never implies it.
8. **Checkout stays closed until it can finish.** No database, no payment
   provider or no shipping rate means checkout says so, rather than opening a
   flow that cannot complete.

## Authentication

| Who | Mechanism |
| --- | --- |
| Customers | Email + password (scrypt). Email must be verified before first sign-in. Random session tokens, stored only as SHA-256, 30-day expiry, revocable, all revoked on password change. Single-use, expiring, hashed tokens for verification and reset. |
| Staff | Email + password (scrypt) into a sealed 8-hour cookie. Roles: Owner, Operations, Content, Support. Every action permission-checked on the server and audited. |
| Stripe → app | `Stripe-Signature` HMAC over timestamp + raw body, five-minute tolerance |
| Scheduler → app | Bearer `CRON_SECRET` |

## Tax and shipping — what the platform does and does not do

Shopify computed these; now INFNITY's tables do.

- **Shipping:** flat rates by country and optional province, with an optional
  free-shipping threshold (`shipping_rates`). No carrier-calculated rates.
- **Tax:** percentage rates by country and optional province; several can apply
  to one address (GST + PST) and each is its own line on the order
  (`tax_rates`). Tables start **empty**: no rate is pre-filled, because whether
  INFNITY must charge GST/HST depends on its registration status, which only the
  owner and their accountant know.

This covers a Canadian apparel seller shipping domestically. It does **not**
cover US state sales-tax nexus, EU/UK VAT with import one-stop-shop rules, or
duties. Selling there means either adding a tax service (Stripe Tax is the
natural fit and slots in behind `priceOrder`) or limiting where the store ships.
This is a known limitation, listed in `production-readiness.md`.

## Environments

`APP_ENV` (or Vercel's environment) names the deployment: `development`,
`staging`, `production`. Each has its own `DATABASE_URL`, Stripe keys and
secrets. The admin shows the environment in a banner on every screen — red only
for production. Staging uses Stripe **test** keys; orders paid in test mode are
flagged `test` and excluded from reports.

## API map

| Route | Purpose | Guard |
| --- | --- | --- |
| `POST /api/cart/resolve` | Price a cart from identities | Public, server-priced |
| `POST /api/checkout` | Create a checkout, reserve stock | Same-origin, rate limit |
| `GET/PATCH/DELETE /api/checkout/session` | Read, update, abandon the checkout | httpOnly cookie, same-origin |
| `POST /api/checkout/payment` | Raise the payment | httpOnly cookie, same-origin |
| `GET /api/checkout/status` | Has it become an order? (read-only) | httpOnly cookie |
| `POST /api/webhooks/stripe` | **Creates orders** | Stripe signature |
| `GET /api/cron/maintenance` | Release expired holds; consented reminders | Bearer secret |
| Account server actions | Register, sign in, reset, profile, addresses | Origin check, rate limit, session |
| Admin server actions | All back-office operations | Staff session, permission, audit |
| `POST /api/newsletter`, `/waitlist`, `/contact`, `/community/submit` | Public forms | Same-origin, rate limit, honeypot |

## Migration risks

Detailed in `migration-plan.md`. In short: passwords and saved cards cannot
move; historical orders arrive as read-only records; stock quantities must come
from a Shopify inventory export because the public feed only says in or out of
stock; and the cutover is a DNS change that is reversible until Shopify is
closed.

## Decisions deliberately deferred

| Topic | Current | Revisit when |
| --- | --- | --- |
| Media storage | Product photos are files in the repository | The owner needs to upload photos from the admin — add object storage (R2/S3) |
| Tax service | Own rate table | Shipping outside Canada |
| Search | In-process scoring | The catalogue passes a few hundred products |
| Multi-location stock | One stock location | A second warehouse or a retail location |
| Gift cards, store credit | Not built | Asked for |
