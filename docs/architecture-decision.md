# Architecture Decision

**Decision: Shopify stays the single system of record for commerce. This
repository is a bespoke storefront and a branded operations dashboard on top of
it. No second catalogue, inventory, order or payment system is built.**

Decided 2026-11-16, after inspecting the repository and the live store.

## What was already installed

| Area | Found in the repository | Decision |
| ---- | ----------------------- | -------- |
| Framework | Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4 | Keep |
| Storefront UI | Complete design system, cart, search, filters, PDP | Keep, restyle to the white theme |
| Data layer | Repository interfaces + local JSON adapter | Keep the seam; add a Shopify adapter behind it |
| Commerce backend | **None.** The previous plan (`PHASE_2_COMMERCE_BACKEND.md`) proposed PostgreSQL, Stripe, hand-rolled accounts, carts, inventory and orders | **Rejected** — see below |
| Shopify / Stripe code | None | Add Shopify; no Stripe |
| Auth, admin, webhooks | None | Add |

## Why not the previous PostgreSQL + Stripe plan

The store already runs on Shopify with a real catalogue, real customers, real
orders and a configured checkout. Building a parallel backend would have meant:

- two inventories that can disagree, which is how overselling happens;
- migrating customers and order history out of the system that holds them;
- re-implementing tax, shipping rates, payment methods, fraud checks, refunds
  and PCI scope that Shopify already provides and the owner already pays for;
- two places to edit a product.

None of that buys the owner anything. The brief asks for exactly one authority.

## Target architecture

```
                     ┌───────────────────────────────────────────────┐
  Customer ─────────►│  INFNITY storefront  (this repo, Next.js)      │
                     │  pages · cart · search · content · community   │
                     └───────┬───────────────────────────┬───────────┘
                             │ read (cached 60s)         │ cart permalink
                             ▼                           ▼
                     Storefront API              Shopify-hosted checkout
                     products · price · stock    payment · tax · shipping
                             ▲                           │
  Owner / staff ────►┌───────┴───────────────┐           │ order
                     │  /admin dashboard      │           ▼
                     │  RBAC · audit log      │──────► Admin API ◄── webhooks
                     └───────┬───────────────┘   products · inventory ·     │
                             │                    orders · customers ·       │
                             ▼                    discounts                  │
                     Document store (KV/file)  ◄─────────────────────────────┘
                     content · offer drafts · drops · waitlists ·   cache
                     consent records · submissions · tickets ·      invalidation
                     staff · audit · webhook receipts               + receipts

  Customer account ──► Customer Account API (OAuth, passwordless, Shopify-hosted)
```

## Data ownership

| Data | Owner | This app |
| ---- | ----- | -------- |
| Products, variants, prices, media | **Shopify** | Reads live (Storefront API); writes via Admin API from `/admin` |
| Inventory | **Shopify** | Reads availability; sets quantities via Admin API with compare-and-set |
| Cart | Browser (identities only) | Re-priced server-side on every read; never trusted |
| Checkout, payment, tax, shipping rates | **Shopify** | Hands off; computes nothing |
| Orders, fulfilment, refunds | **Shopify** | Reads; adds notes and tracking via Admin API. Refunds and cancellations are done in Shopify |
| Customers, addresses, login | **Shopify** | Customer Account API; no passwords stored here |
| Discounts | **Shopify** once activated | Authors drafts; activation creates the Shopify discount |
| Marketing consent | **Shopify** customer record | Records the consent event, then syncs it to Shopify |
| Homepage content, hero, lookbook | This app | Document store |
| Drops, waitlists | This app | Document store |
| Community submissions, tickets | This app | Document store |
| Staff accounts, audit log | This app | Document store |

There is no field that two systems both write.

## Catalogue: live, with a committed fallback

`src/data/adapters/shopify/catalog.ts` reads the Storefront API and caches for 60
seconds. A product published in Shopify appears on the storefront within a
minute, with no deployment; webhooks shorten that to seconds.

The snapshot committed under `src/data/catalog/` is the fallback when Shopify is
unreachable, and the source of locally hosted photography. A stale "in stock" in
the fallback cannot become a wrongly accepted order, because Shopify checkout
re-validates stock.

The Storefront API is used in its **tokenless** mode, verified against the live
store on 2026-11-16 (`2026-10`): products, variants, prices and availability are
readable with no credential. `quantityAvailable` is not (it needs the
`unauthenticated_read_product_inventory` scope), so the storefront shows
in-stock / sold-out and never a count. Exact quantities are an admin-only view.

## Checkout: cart permalink

Checkout is handed to Shopify with a cart permalink:

```
https://<store>/cart/<variantId>:<qty>,<variantId>:<qty>?discount=<CODE>
```

`POST /api/checkout` re-resolves every line against the live catalogue, refuses
sold-out or vanished lines, and returns that URL. It needs no credential, writes
nothing to the store, and works today.

Alternative considered: the Storefront Cart API (`cartCreate` → `checkoutUrl`).
It creates a cart object in the store for every visitor and adds a network
dependency to "add to cart" for no benefit at this catalogue size. The permalink
keeps the cart instant and offline-tolerant. The seam (`buildCheckoutUrl`) is one
function if this is revisited — for example to support cart-level attributes or
Shopify Markets pricing per region.

**Consequence to know about:** the cart subtotal on this site is the sum of
catalogue prices in CAD. If the store uses Shopify Markets with different
regional pricing, checkout shows the regional price. The cart says, in words,
that final prices, tax, shipping and discounts are confirmed at checkout.

## Offers: drafts here, enforcement in Shopify

An offer is authored as a draft in `/admin`. Only an Owner can activate it, after
ticking a margin acknowledgement. Activation creates a native Shopify discount:

| Offer | Shopify object |
| ----- | -------------- |
| X% off with a code | `discountCodeBasicCreate` |
| X% off, first order only | Code discount limited to a customer segment `number_of_orders = 0`, once per customer |
| Bundle: X% off when buying N or more | `discountAutomaticBasicCreate` with a minimum-quantity requirement |

Because both kinds are native discounts, the saving estimated in the cart and the
total at checkout cannot disagree by design. The storefront advertises an offer
only when it is live **and** has a Shopify discount id.

Not supported, deliberately: fixed "any two for $X" bundle prices. Those need a
Shopify Functions app or the Shopify Bundles app; a percentage bundle covers the
request without a second pricing engine.

## Authentication

| Who | Mechanism |
| --- | --------- |
| Customers | Shopify Customer Account API — OAuth 2.0 authorization code + PKCE, Shopify-hosted passwordless login. Tokens held in an encrypted, httpOnly cookie. No password is ever stored here. |
| Staff | Email + password (scrypt) into a sealed 8-hour session cookie. Roles: Owner, Operations, Content, Support. Every action is permission-checked on the server and audited. |
| Shopify → app | Webhook HMAC-SHA256 over the raw body, constant-time compare |

Staff accounts are local rather than Shopify staff accounts because the Admin API
is reached with one app token; mapping roles here gives least privilege *inside*
that token's reach.

## API and webhook map

| Route | Purpose | Auth |
| ----- | ------- | ---- |
| `POST /api/cart/resolve` | Price a cart from identities; estimate live offers | Public |
| `POST /api/checkout` | Validate cart, return Shopify checkout URL | Same-origin, rate-limited |
| `GET /api/search` | Product search | Public |
| `POST /api/newsletter` | Record marketing consent; sync to Shopify | Same-origin, rate-limited |
| `POST /api/waitlist` | Join a drop waitlist | Same-origin, rate-limited |
| `POST /api/contact` | Create a support ticket; optional email | Same-origin, rate-limited, honeypot |
| `POST /api/community/submit` | Upload a community photo for moderation | Same-origin, rate-limited |
| `GET /api/auth/customer/login` · `callback` · `POST logout` | Customer OAuth | PKCE + state |
| `/api/admin/*` and admin server actions | Dashboard operations | Staff session + permission |
| `POST /api/webhooks/shopify` | Shopify events | HMAC |

Webhook topics to subscribe: `products/create`, `products/update`,
`products/delete`, `inventory_levels/update`, `collections/update`,
`orders/create`, `orders/paid`, `orders/updated`, `orders/cancelled`,
`orders/fulfilled`, `fulfillments/create`, `fulfillments/update`,
`refunds/create`, plus the mandatory privacy topics `customers/data_request`,
`customers/redact`, `shop/redact`.

Handlers invalidate caches and keep a receipt. They never rebuild order state
from payloads: order data is always read back from Shopify.

## Storage

One `DocumentStore` interface, three adapters:

| Adapter | When | Durable |
| ------- | ---- | ------- |
| KV (Vercel KV / Upstash Redis REST) | `KV_REST_API_URL` + `KV_REST_API_TOKEN` set | Yes |
| File (`./.data`) | A server or a laptop | Yes, on that machine |
| File (`/tmp`) | Vercel without KV | **No** — admin Settings says so in plain words |

A relational database was considered and not added: nothing stored here is
relational commerce data, and a KV store is one click on the existing Vercel
deployment path.

## Migration risks

| Risk | Mitigation |
| ---- | ---------- |
| Pointing `infinityclo.ca` at this app breaks checkout links | Checkout uses the permanent `*.myshopify.com` domain by default; a `checkout.` subdomain can be configured later |
| Lost search rankings | Product URLs are unchanged (`/products/<handle>`); every other legacy path has a permanent redirect; sitemap regenerated |
| Shopify emails link to the old theme's account pages | Customer accounts stay Shopify-hosted; links keep working |
| Duplicate marketing email | One list: consent syncs to Shopify; abandoned-checkout email stays a Shopify automation; this app sends none |
| Rollback | The Shopify theme is untouched. Rollback is a DNS change back to Shopify |

## External configuration required

Nothing below can be done from this repository; each needs the owner's Shopify
admin. Full steps are in `launch-checklist.md`.

| Capability | What the owner provides | Variable |
| ---------- | ----------------------- | -------- |
| Browse, cart, checkout | Nothing | — |
| Admin dashboard on real data | A custom app's Admin API token | `SHOPIFY_ADMIN_ACCESS_TOKEN` |
| Customer sign-in on this site | Customer Account API client (Headless channel) | `SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID` |
| Instant catalogue updates, order events | Webhook subscriptions + signing secret | `SHOPIFY_WEBHOOK_SECRET` |
| Persistent admin data on Vercel | A KV store | `KV_REST_API_URL`, `KV_REST_API_TOKEN` |
| Staff sign-in | Run `npm run admin:setup` | `ADMIN_OWNER_EMAIL`, `ADMIN_OWNER_PASSWORD_HASH`, `SESSION_SECRET` |
| Contact form email | A Resend account (optional) | `RESEND_API_KEY`, `CONTACT_TO_EMAIL`, `EMAIL_FROM` |
