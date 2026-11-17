# Production-Readiness Checklist

**Verdict today: not ready for live orders. Ready for staging UAT.**

The platform's own logic is built and tested. What stands between it and real
orders is configuration only the owner can provide, plus verification that can
only happen against real services. Nothing below has been faked to look done.

Legend: **READY** — built and verified here. **OWNER** — needs the owner.
**TO DO** — engineering still required. **UNVERIFIED** — built, not yet proven
against the real service.

## 1. Acceptance criterion

> InfinityClo must accept, process, fulfil and track real orders with Shopify
> completely disconnected.

| Capability | State | Evidence / what is missing |
| --- | --- | --- |
| Runs with no Shopify dependency | READY | No Shopify code path at runtime; verified by search and by the test suite running offline |
| Accept an order | READY in test mode | Browser test: guest and signed-in purchase |
| Process payment | **UNVERIFIED** | Stripe integration written; signature verification unit-tested; **never run against Stripe** — no keys exist |
| Fulfil | READY | Admin fulfilment with tracking; stock decrement; tested |
| Track | READY | Customer order page with shipments; delivery only when recorded |
| Refund / cancel | READY in test mode, **UNVERIFIED** against Stripe | Idempotent refund and cancel tested with the test provider |

## 2. Blockers before any real order

| # | Item | Owner of the task | State |
| - | ---- | ----------------- | ----- |
| 1 | Production PostgreSQL (`DATABASE_URL`), migrations applied | OWNER creates; engineering applies | OWNER |
| 2 | Stripe account verified; `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | OWNER | OWNER |
| 3 | Stripe webhook endpoint `https://<site>/api/webhooks/stripe` subscribed to `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled` | Engineering, in the owner's Stripe account | OWNER |
| 4 | End-to-end purchase and refund in Stripe **test** mode on staging | Engineering + owner | UNVERIFIED |
| 5 | One real card purchase and refund in live mode | Owner approval required | OWNER |
| 6 | Email provider (`RESEND_API_KEY`, `EMAIL_FROM`) with a verified sending domain | OWNER | OWNER — without it customers cannot verify an account or reset a password, and no confirmation is sent |
| 7 | Shipping rates entered in Admin → Settings | OWNER | OWNER — checkout stays closed until one exists |
| 8 | Tax: registration status confirmed with an accountant; rates entered (or deliberately none) | OWNER | OWNER |
| 9 | Real stock counts imported (`npm run db:inventory`) — 92 variants currently sell uncounted | OWNER exports; engineering imports | OWNER |
| 10 | Admin owner account and `SESSION_SECRET` for production | `npm run admin:setup` | OWNER |
| 11 | Policies (shipping, returns, privacy, terms) reviewed; privacy policy updated to name Stripe, the database and email providers instead of Shopify | OWNER / legal | OWNER |
| 12 | Migration rehearsal on real exports, reconciled | Engineering + owner | OWNER |

## 3. Commerce correctness

| Check | State |
| --- | --- |
| Prices, shipping, tax and discounts computed only on the server, integer cents | READY — unit + integration tests |
| Last unit cannot be sold twice | READY — integration + browser test |
| Abandoned checkouts release stock | READY — tested; also released on a schedule when `CRON_SECRET` is set |
| Order created only from a verified payment event with matching amount | READY — tested, including tampered amount |
| Replayed webhook creates no second order | READY — tested |
| Late payment after hold expiry is honoured and flagged | READY — tested |
| Refund cannot exceed the amount paid; retried refund pays once | READY — tested |
| Discount limits: window, usage cap, once per customer, first order | READY — tested |
| Sold-out variant cannot be added or checked out | READY — browser test |
| Scheduled launch goes live at its time; drafts never visible | READY — tested |
| Tested on real PostgreSQL server (not only the embedded engine) | **TO DO** — run the suite against a Neon branch |
| Daily reconciliation of orders against Stripe payouts | **TO DO** |
| Load test of a drop (many simultaneous checkouts on few units) | **TO DO** |

## 4. Security

| Check | State |
| --- | --- |
| Card data never touches this server (Stripe Payment Element) | READY by design |
| Passwords hashed with scrypt; constant-time verification | READY — tested |
| Sessions: random tokens, stored hashed, httpOnly, SameSite, Secure in production, revocable | READY — tested |
| Email verification before first sign-in; single-use hashed tokens | READY — tested |
| No account enumeration via register / reset / sign-in | READY — tested |
| Customer isolation on orders and addresses | READY — integration + browser test |
| Admin RBAC enforced server-side on every action; audit log | READY — tested |
| CSRF: origin check on API mutations; Next.js origin check on server actions | READY — tested |
| Rate limits on sign-in, registration, reset, checkout, public forms | READY, per instance |
| Webhook signature verification, replay window | READY — tested |
| Upload validation by content, re-encoding, size limit | READY — tested |
| Secrets only in environment variables; none in the repository; status page shows names only | READY — repository searched |
| Edge rate limiting / WAF | **TO DO** — add a Vercel Firewall rule for `/api/*`, `/account/*`, `/admin/login` |
| Security headers (CSP allowing Stripe, HSTS, frame-ancestors, nosniff, referrer and permissions policies) | READY — browser test |
| CSP without `unsafe-inline` (per-request nonces) | **TO DO** — hardening |
| Two-factor authentication for staff | **TO DO** — recommended before adding staff |
| Dependency audit in CI | READY — runs on every push |
| Independent security review / penetration test | **TO DO** — recommended before live payments |

## 5. Data protection and recovery

| Check | State |
| --- | --- |
| Single database for all business data | READY |
| Automated backups with point-in-time recovery | OWNER — enable on the database host |
| Restore tested | **TO DO** — restore a backup to a branch and run `db:status` |
| Migrations versioned and reviewable | READY — `drizzle/` |
| Separate development / staging / production databases and keys | READY in code; OWNER to provision |
| Customer erasure | READY — function tested; **TO DO** an admin button |
| Data export on request | Partially — CSV exports in admin |
| Retention schedule for abandoned checkouts and logs | **TO DO** |

## 6. Privacy and anti-spam (Canada)

| Check | State |
| --- | --- |
| Marketing consent explicit, unticked by default, recorded with wording, time, source | READY — tested |
| Account creation and purchase never imply marketing consent | READY — tested |
| Unsubscribe link signed; works without signing in | READY — tested |
| Abandoned-checkout reminder only with opt-in, sent at most once | READY |
| Transactional vs marketing email separated | READY |
| Sender identity and mailing address in marketing email (CASL) | n/a — no marketing email is sent by this platform |
| Privacy policy reflects the real processors | OWNER — currently the legacy text |
| Cookie use limited to essential cookies; no analytics tags installed | READY |

## 7. Operations

| Check | State |
| --- | --- |
| Admin: products, stock, orders, refunds, customers, promotions, content, drops, community, settings | READY — browser tested |
| Environment banner so staging is never mistaken for live | READY |
| Checkout readiness shown in Admin → Settings with the exact missing items | READY |
| Order confirmation and shipping emails | READY, needs provider |
| Error monitoring and alerting (Sentry or similar) | **TO DO** |
| Uptime monitoring on `/` and `/api/checkout` | **TO DO** |
| Scheduled maintenance (`/api/cron/maintenance` every 10 min) | OWNER — set `CRON_SECRET` and a Vercel Cron |
| Runbook: checkout down, webhook failing, oversell, refund dispute | **TO DO** |
| Product photo upload from admin | **TO DO** — today images are added by URL or by a deploy |
| Named maintainer / on-call for launches | OWNER |

## 8. Storefront

| Check | State |
| --- | --- |
| Responsive at 390 px and 1440 px, no horizontal scroll | READY — browser tests |
| Keyboard navigation, skip link, labelled controls, reduced motion | READY — spot-checked; **TO DO** a full accessibility audit |
| Real catalogue, CAD prices with cents, sold-out states | READY |
| Legacy URLs redirect permanently | READY — tested |
| Sitemap, robots, canonical tags, product structured data | READY — tested |
| Private areas not indexable | READY — tested |
| Original campaign photography and a vector logo | OWNER — see `assets-and-rights.md` |
| Core Web Vitals measured on the deployed site | **TO DO** after staging deploy |

## 9. Known limitations at launch

- Flat-rate shipping only; no carrier-calculated rates or label printing.
- Tax by rate table; suitable for Canada, not for US/EU compliance.
- One stock location.
- A guest's cart lives in the browser it was built in.
- One discount per order; no fixed-price bundles, gift cards or store credit.
- Imported historical orders are read-only and cannot be refunded here.
- Community photo uploads need a host with a durable disk or object storage.
- Rate limiting is per server instance until an edge rule is added.

## 10. Go / no-go

Go-live requires every item in section 2, the three TO DO items in section 3,
security headers and edge rate limiting from section 4, backups from section 5,
and monitoring from section 7. Switching production traffic, taking a live
payment and retiring Shopify each need the owner's explicit approval.
