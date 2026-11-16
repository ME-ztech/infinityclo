# Architecture Decision — INFNITY commerce platform

_Status: **Accepted** (2026-11-16). Supersedes the Stripe/PostgreSQL commerce
plan in `PHASE_2_COMMERCE_BACKEND.md`, which was written before the legacy store
could be inspected._

## 1. Current stack (verified)

| Layer | Found in repository |
| --- | --- |
| Framework | Next.js **16.3** App Router, React **19.2**, TypeScript 6 strict, Tailwind CSS 4 |
| Data | Repository interfaces (`src/data/repositories.ts`) over a JSON snapshot; snapshot was **empty** |
| Cart | `localStorage` identities only, priced server-side (`/api/cart/resolve`) — no client-side money |
| Checkout / payments | None. `NEXT_PUBLIC_CHECKOUT_ENABLED` unset; checkout disabled |
| Auth / accounts | None (honest "not open yet" pages) |
| Admin | None |
| Tests | Vitest (86 passing), Playwright desktop + Pixel 7 against a production build |
| Deploy | Vercel docs; no Vercel credentials in this environment |

The legacy store is **Shopify** (`apparelinifinty85.myshopify.com`, CAD, Canada),
already holding the products, customers, orders, payments configuration and an
active discount campaign. The repository has **no** operational commerce
backend, so there is nothing to retain on that side.

## 2. Decision

**Shopify stays the single system of record for commerce.** The repository
becomes a bespoke headless storefront plus a branded back office that talk to
Shopify through its official APIs. A small application database holds only the
data Shopify does not model.

```
                        ┌───────────────────── Shopify (system of record) ─────────────────────┐
                        │ catalogue · variants · inventory · customers · orders · discounts    │
                        │ checkout · payments · taxes · shipping · fulfilment · refunds · email │
                        └──────▲──────────────────▲───────────────────▲──────────────▲─────────┘
            Storefront API     │   Customer Acct  │     Admin GraphQL │    Webhooks  │ (HMAC)
          (products, carts)    │   API (OAuth)    │     (server only) │              │
┌──────────────────────────────┴──────────────────┴───────────────────┴──────────────┴────────┐
│ Next.js app (this repo, Vercel)                                                              │
│  Storefront  /  /shop  /products/*  /cart  /styled-by-you  /coming-soon  /contact …          │
│  Customer    /account  (orders, tracking, addresses, profile, help requests)                │
│  Back office /admin    (RBAC, audit log; Shopify-backed + app-owned modules)                 │
│  App DB (Postgres via Drizzle; PGlite locally): CMS, promotions drafts, drops & waitlists,  │
│  newsletter consent, community submissions, contact inbox, staff, sessions, audit log,      │
│  webhook ledger, rate limits                                                                 │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Why not a custom commerce backend

Rebuilding checkout, tax, payments, fraud, fulfilment and refunds would create a
second system of record next to a Shopify store that already runs them, with
real customers and order history in it. The brief forbids two conflicting
systems and a second payment system; Shopify-hosted checkout means **raw card
data never touches this application**.

## 3. Data ownership

| Data | Owner | Notes |
| --- | --- | --- |
| Products, variants, prices, compare-at, SKUs, media, inventory | **Shopify** | Admin edits go to Shopify via Admin GraphQL; storefront reads Storefront API, falls back to an imported snapshot |
| Customers, addresses, marketing consent on customer record | **Shopify** | Newsletter opt-ins are additionally written to Shopify `emailMarketingConsent` when Admin API is connected |
| Orders, payment status, fulfilment, tracking, refunds, cancellations | **Shopify** | Read-only in our UI except notes/tags/fulfilment actions through supported mutations |
| Discounts (live) | **Shopify** | Our promotions are drafted in the app DB and only become real when an owner approves and the app creates the Shopify discount |
| Checkout, taxes, shipping rates, currency | **Shopify** | Never computed or hard-coded by us |
| Order / shipping / account emails | **Shopify** notifications | We send no order emails → no duplicates |
| Homepage CMS, hero slides, lookbook, announcement bar, section order | App DB | |
| Promotion drafts, approvals, sync state | App DB | |
| Drops (coming soon lifecycle) & waitlists | App DB (+ Shopify product link) | |
| Newsletter subscribers & consent evidence | App DB (+ Shopify sync) | Consent text, timestamp, source stored per subscriber |
| Community submissions, consent, moderation | App DB | |
| Contact / help / return requests | App DB | Admin inbox; never auto-refunds |
| Staff users, roles, sessions, audit log | App DB | |
| Webhook delivery ledger (idempotency) | App DB | Unique on `X-Shopify-Webhook-Id` |

## 4. Authentication

| Audience | Approach |
| --- | --- |
| **Shoppers** | Guest checkout always available. Sign-in uses Shopify **Customer Account API** (OAuth 2.0 authorization code + PKCE, OIDC discovery from the shop domain). Tokens are kept server-side in an AES-256-GCM sealed, `HttpOnly`, `Secure`, `SameSite=Lax` cookie; refresh tokens rotate; sign-out calls Shopify's `end_session_endpoint`. No passwords are stored by us. Until configured, "Sign in" links to Shopify's hosted account pages, where order history already works. |
| **Staff** | App-owned accounts: scrypt-hashed passwords, DB-backed sessions (hashed token, 12 h idle / 7 d absolute), `HttpOnly` `Secure` `SameSite=Strict` cookie, login rate limit + lockout, roles **Owner, Operations, Content/Marketing, Support** with a server-enforced permission matrix on every page, server action and route. Mutations are Server Actions (origin-checked by Next.js) and every one writes the audit log. |

## 5. API & webhook map

| Integration | Endpoint / version | Used for | Env |
| --- | --- | --- | --- |
| Storefront API | `https://{shop}.myshopify.com/api/2026-10/graphql.json` | products, collections, availability, cart create/update, `checkoutUrl`, policies | `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_STOREFRONT_ACCESS_TOKEN` |
| Cart permalink (fallback) | `https://{shop}/cart/{variantId}:{qty},…` | Checkout hand-off with no API token, using real variant ids | `CHECKOUT_MODE=permalink` |
| Customer Account API | discovery: `https://{shop}/.well-known/openid-configuration`, `/.well-known/customer-account-api` | sign-in, profile, addresses, orders, fulfilment tracking | `SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID` (+ `_SECRET` for confidential clients) |
| Admin GraphQL | `https://{shop}.myshopify.com/admin/api/2026-10/graphql.json` | products/media/variants/publishing, inventory, orders, fulfilment, customers, discounts, shop settings, analytics aggregates | `SHOPIFY_ADMIN_ACCESS_TOKEN` (server only) |
| Webhooks → `/api/webhooks/shopify` | HMAC-SHA256 (base64) of raw body with app client secret; dedupe on `X-Shopify-Webhook-Id` | `orders/*`, `fulfillments/*`, `refunds/create`, `products/*`, `inventory_levels/update`, `customers/*`, mandatory privacy topics | `SHOPIFY_WEBHOOK_SECRET` |
| Email (app-owned messages only) | Resend HTTP API | newsletter double opt-in, waitlist confirmation, contact notifications | `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_NOTIFICATION_EMAIL` |
| Database | Postgres (`DATABASE_URL`, e.g. Neon via Vercel) — PGlite in-process when unset (local/preview only) | app-owned data | `DATABASE_URL` |

Admin GraphQL calls honour Shopify's cost-based throttling (retry with backoff on
`THROTTLED`, respect `throttleStatus`), and inventory writes use
compare-and-set quantities so a stale screen cannot double-decrement stock.

## 6. Runtime modes (no fake "production ready")

`src/commerce/config.ts` resolves a mode from the environment and the admin
**Settings → Integrations** screen shows it plainly:

| Capability | Not configured | Configured |
| --- | --- | --- |
| Catalogue | Imported snapshot of the live store (real products, prices, photos; availability as of import) — labelled with import date | Live Storefront API |
| Checkout | `disabled` (default) or `permalink` (real Shopify checkout via cart permalink) | Storefront Cart API → `checkoutUrl` |
| Customer accounts | Link to Shopify-hosted account pages | Native `/account` portal |
| Admin products / inventory / orders / customers / live discounts / sales analytics | **Disabled with the exact missing credential and scopes named** | Live |
| CMS, promotions drafts, drops, waitlists, newsletter, community, inbox, staff, audit | Works (DB) | Works (DB) |

## 7. Migration risks

| Risk | Mitigation |
| --- | --- |
| Live store disrupted during build | Nothing is written to Shopify by this build. All Admin writes are behind staff auth, RBAC, confirmations and the audit log, and require owner-provided credentials. |
| SEO loss on cutover | Product handles preserved (`/products/{handle}`); permanent redirects for `/collections/all`, `/pages/*`, `/policies/*`, `/account/login`; sitemap + canonical URLs. |
| Checkout domain after DNS cutover | `infinityclo.ca` will point at Vercel; Shopify checkout must move to a subdomain (e.g. `shop.infinityclo.ca`) set as the Shopify primary domain. See `deployment-and-rollback.md`. |
| Classic → new customer accounts | Required for the Customer Account API. Existing customers keep their order history; they sign in with a one-time code instead of a password. Owner switch in Shopify settings. |
| Active AVADA gift campaign (`FREESKII`, spend $100 → free socks) | Theme-app JS does not run headless. Owner decides: recreate as a native Shopify automatic discount (modelled as a draft promotion) or retire. |
| EcomSend / chatbot apps | Theme-embedded; they do not carry over. Newsletter capture is native; chat is out of scope. |
| Third-party names in product titles | Flagged for owner/legal review; not changed. |
| PGlite on serverless is per-instance | Production refuses to run app-DB features without `DATABASE_URL`; preview shows an "ephemeral storage" banner. |

## 8. Exact external configuration required

See `docs/launch-checklist.md` → **NEEDS OWNER ACTION** for the click-path. In
short: install the **Headless** sales channel (Storefront token + Customer
Account API client), create a custom app with the Admin API scopes listed there,
switch to new customer accounts, provision Postgres, set the env vars in
`.env.example`, register webhooks, and add a Shopify checkout subdomain before
DNS cutover.
