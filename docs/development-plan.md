# Development Plan (revised)

Revised 2026-11-16 after the architecture correction: the target is a
proprietary commerce platform with Shopify disconnected.

## What was reusable from before the correction

| Asset | Reused? | Notes |
| --- | --- | --- |
| Source audit, asset manifests, rights notes | Yes, unchanged | `source-audit.md`, `assets-and-rights.md` |
| Imported catalogue (33 products) and 90 photographs | Yes | Now seeded into the database |
| Brand assets, size charts, community wall | Yes | |
| Storefront design system and all public pages | Yes | Checkout handoff swapped for on-site checkout |
| Domain logic: money, product, taxonomy, offers, size charts | Yes | |
| Security primitives: sealed cookies, scrypt, CSRF origin check, rate limiting | Yes | |
| Document store, audit log, CMS model, records (drops, consent, tickets) | Yes | Gained a PostgreSQL adapter |
| Admin: auth, roles, permission-guarded actions, UI kit | Yes | Pointed at the native gateway |
| Admin commerce gateway **interface** | Yes | New native implementation behind it |
| Public form APIs (newsletter, waitlist, contact, community upload) | Yes | Shopify sync removed |
| Test infrastructure (Vitest, Playwright) | Yes | Extended |
| Shopify admin gateway, customer OAuth, Storefront adapter, webhook route | **Removed** | Superseded |
| Shopify importer scripts | Kept | Migration only |

## Delivered

| Workstream | Delivered | Verified by |
| --- | --- | --- |
| Data model | 27-table PostgreSQL schema, generated migration | Migrations run on the embedded engine |
| Catalogue | Database-backed, scheduled launch, pre-order flag | Integration tests |
| Inventory | Reservations, expiry, ledger, compare-and-set edits | Integration + browser tests |
| Pricing | Pure integer-cent pricing: discounts, shipping, tax lines | Unit + integration tests |
| Checkout | On-site: contact, address, shipping, code, payment, confirmation | Browser tests |
| Payments | Stripe provider; test provider for development | Signature tests; **not run against Stripe** |
| Orders | Fulfil, deliver, refund, cancel, timeline | Integration tests |
| Customers | Register, verify, sign in, reset, profile, addresses, order history, help | Integration + browser tests |
| Admin | All back-office modules on the native engine | Browser tests |
| Migration | Catalogue, stock, customers, orders, reconciliation | Tests on synthetic exports |
| Documentation | Architecture, data model, migration, readiness, cost assessment | — |

## Remaining, in order

### 1 — Connect real infrastructure (about 1 week; needs the owner)

| Task | Hours | Needs |
| --- | --- | --- |
| Provision staging and production databases; run migrations | 3 | Owner: database account |
| Run the full test suite against real PostgreSQL | 3 | A database branch |
| Stripe test keys on staging; register the webhook | 3 | Owner: Stripe account |
| Email provider and sending domain | 3 | Owner: DNS access |
| Staging deployment with environment variables and cron | 4 | Owner: Vercel account |

### 2 — Prove payments (about 1 week)

| Task | Hours |
| --- | --- |
| Stripe test-mode UAT: success, decline, 3-D Secure, abandoned, refund, partial refund | 8 |
| Fix whatever the first real Stripe run reveals | 6 |
| Stripe reconciliation report (orders vs. charges) | 8 |
| Security headers including a CSP that permits Stripe | 4 |

### 3 — Migration rehearsal (about 1 week; needs exports)

| Task | Hours |
| --- | --- |
| Dry runs on real customer, order and inventory exports; adjust importers | 8 |
| Staging import and reconciliation with the owner | 6 |
| Customer communication for cutover | 2 |

### 4 — Operate safely (1–2 weeks, can overlap)

| Task | Hours |
| --- | --- |
| Error monitoring, uptime checks, alert routing | 6 |
| Edge rate limiting | 2 |
| Backup restore drill | 3 |
| Runbooks | 5 |
| Load test of a drop | 8 |
| Accessibility audit and fixes | 8 |

### 5 — Cutover (owner approval)

Live keys, one real order and refund, DNS, customer email. See
`migration-plan.md`.

### 6 — After launch

| Item | Hours | Why |
| --- | --- | --- |
| Photo upload to object storage from admin | 16–24 | Owner publishes a product with no developer |
| Staff two-factor authentication | 8–12 | Before adding staff |
| Server-side carts for signed-in customers | 8–12 | Cart follows the customer across devices |
| Customer erasure and data-export buttons in admin | 6 | Privacy requests |
| Post-purchase recommendations | 8 | Requested upsell |
| Stripe Tax or equivalent | 12–20 | Only if selling outside Canada |
| Carrier rates and labels | 20–40 | When flat rates stop being enough |

## Working agreements

- One schema, changed only through reviewed migrations.
- No feature is called done without a test that would fail if it broke.
- Nothing simulated is described as production-ready. The test payment provider
  cannot be enabled on a real production deployment.
- Development, staging and production have separate databases and keys.
- Production deploys, live payments, DNS changes and anything that deletes
  customer or order data need the owner's approval.
