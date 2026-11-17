# Test Evidence

Run on 2026-11-16, on the owner's Windows machine (Node 24), commit at the head
of `claude/charming-knuth-7lofqd`.

## What was real and what was simulated

Read this first. It governs how far each result below can be trusted.

| Layer | In these tests | Real? |
| ----- | -------------- | ----- |
| Catalogue | The 33 products imported from infinityclo.ca | **Real data** |
| Database | PostgreSQL semantics via PGlite (PostgreSQL compiled to WebAssembly), in memory for unit runs and on disk for browser runs | **Real SQL, constraints and transactions; not a PostgreSQL server.** Not yet run against Neon or another server. |
| Application | A production build (`next build` + `next start`) for browser tests | **Real** |
| Browser | Installed Chrome, desktop 1440×900 and Pixel 7 emulation | **Real** |
| Payments | A local test provider. It goes through the same code path as Stripe — raise payment, signed webhook, order creation — but **no card network and no Stripe API was contacted.** | **Simulated** |
| Stripe integration | Webhook signature verification is unit-tested against Stripe's documented scheme. `paymentIntents.create`, `update` and `refunds.create` have **never been executed.** | **Unverified** |
| Email | Captured to a file and read by the tests | **Simulated delivery**; real templates |
| Customers, orders | Created by the tests | **Synthetic** |
| Shopify migration of customers and orders | Synthetic rows in Shopify's export column layout | **Not run on real exports** |
| Real money | None. No charge, refund or payout occurred. | — |

No real customer, order or payment data was created, read or changed anywhere,
and nothing was written to the Shopify store.

## Commands and results

| Command | Result |
| ------- | ------ |
| `npm run typecheck` | Pass, 0 errors |
| `npm run lint` | Pass, 0 errors, 3 warnings (intentional full-page navigations in checkout) |
| `npm test` | **274 passed**, 21 files |
| `npm run build` | Pass; 33 product pages generated |
| `npm run e2e` (with `PW_CHANNEL=chrome`) | **91 passed**, 23 skipped by design (viewport-specific or desktop-only flows) |
| GitHub Actions CI on the pull request and on `main` | Pass |
| `npm audit --omit=dev` | 0 vulnerabilities (after `npm audit fix`) |
| `npm run db:migrate`, `db:seed`, `db:status`, `migrate:reconcile` | Ran against the development database: 33 products, 156 variants, 90 images |

## Unit and integration tests (267)

| File | Covers |
| ---- | ------ |
| `src/server/commerce/checkout.test.ts` (27) | Pricing from the database; stock reservation; sold-out and draft refusal; scheduled launch; pre-order; shipping and multi-rate tax (GST + PST); free-shipping threshold; discount codes valid / unknown / paused / expired / exhausted; bundle threshold; address validation; payment prerequisites; order created once; replayed webhook; **tampered amount creates no order**; forged signature; failed payment then retry; usage counting; once-per-customer; first-order only; cancel; expiry release; late payment with oversell flag |
| `src/server/commerce/engine.test.ts` (33) | Catalogue visibility and live availability; compare-and-set stock edits and ledger; full and partial fulfilment; tracking-link sanitising; delivery only when marked; partial refund; **retried refund pays once**; refund ceiling; restock; cancel with stock release; order search; registration, verification, sign-in; weak passwords; no duplicate accounts; identical errors for wrong password and unknown account; sign-out; reset signs out all devices; password change; migrated-customer claim; consent recording; addresses; **customer isolation**; guest orders attach only after verification; erasure; **Stripe signature verification** (valid, wrong secret, modified body, stale, missing, unconfigured) |
| `src/server/commerce/migration.test.ts` (11) | CSV edge cases; exact money parsing; customer import (consent origin, idempotent, dry run, claim flow); order import (grouping, exact totals, timezone, idempotent, cannot be refunded, no stock effect); stock count import; reconciliation |
| `src/domain/offers.test.ts`, `pricing` via checkout, `money`, `product`, `taxonomy`, `checkout` | Offer validation and estimates; rounding; variant logic; category derivation |
| `src/server/foundations.test.ts` | Sealed sessions (tamper, purpose, expiry, production without secret); scrypt; same-origin check; rate limiting; file and KV stores including concurrent insert-if-absent; content normalisation against hostile input; safe links and image sources; consent idempotency |
| `src/server/admin/*.test.ts` | Permission matrix; login lockout; offer activation rules (owner only, margin check); native gateway product and stock operations; rate validation; CSV formula-injection escaping |
| `src/app/api/*/route.test.ts` | Newsletter (consent required, idempotent, signed unsubscribe); contact (honeypot, validation, rate limit, email escaping); community upload (content sniffing, size limit) |
| Component tests | Newsletter form, cart storage validation, wishlist, URL parameters |

## Browser tests (90 passed)

`e2e/purchase.spec.ts` — desktop, serial:

| Test | Proves |
| ---- | ------ |
| A guest buys a product and lands on a confirmed order | Cart → checkout → address → shipping $12.00 → GST → bad code explained → good code applied server-side → pay → order number → cart emptied → confirmation email with the exact total |
| The confirmation page does not invent an order | Visiting the URL directly shows no order |
| The last unit cannot be bought twice | With one in stock and one shopper at checkout, a second shopper sees the size struck through, the button disabled, and a hand-built request is refused (409); returning to the cart releases it |
| A customer registers, verifies, signs in, buys and tracks the order | Unverified sign-in refused; emailed link; signed-in checkout pre-fills email; order appears in account with correct total; no shipment and no "delivered" before fulfilment; sign-out protects the pages |
| One customer cannot open another customer's order | Second verified account gets 404 on the first account's order URL |
| Registering an existing address reveals nothing and changes nothing | Same response; original password still works |
| The payment webhook rejects unsigned and forged requests | 401 |

`e2e/storefront.spec.ts` — desktop and phone: every public route returns 200
with one `h1` and no sideways scroll; unknown product 404; legacy paths 308 to
their new homes; robots and sitemap; signed-out redirects; landmarks and skip
link; every header and footer link resolves; hero slideshow controls
(pause/play, next); brand statement and real products; shop lists 30+ products
and sorts by price; search; product page price, sizes, `ADD TO CART — $29.99`,
quantity changes the total, sold-out disabled, structured data in CAD; cart add,
quantity, persistence across reload, remove; server ignores client-supplied
prices; newsletter requires consent; form endpoints refuse cross-site and
consent-less requests; phone menu; phone buy button within the viewport and at
least 44 px tall.

`e2e/admin.spec.ts` — desktop, serial: signed-out redirect; wrong password
rejected; sign in; create a draft product (404 on the storefront) → count stock
in → publish → reachable on the storefront; add a shipping rate; offer draft →
shows Draft → margin check → activate → shows Live; edit a hero title → visible
on the homepage; hide a community wall entry; sign out.

## Defects the tests found (and fixed)

| Found by | Defect | Fix |
| -------- | ------ | --- |
| Purchase test | A size that had just sold out stayed selectable for up to a minute (page cache) | Stock changes refresh the affected product pages immediately |
| Purchase test | Text typed into checkout before the page finished loading was wiped | Inputs made uncontrolled; values read from the form on submit |
| Purchase screenshot | Form fields rendered as dark blocks | Field colour token corrected |
| Admin worker | Whole-dollar prices displayed without cents | Prices always show two decimals |
| Storefront test | `/checkout` was indexable | Added to robots exclusions |
| Admin worker | Duplicate SKU or code surfaced as a raw database error | Friendly message |
| Admin worker | A three-letter country code was silently truncated | Rejected with a message |
| Unit test | Test setup assumed a browser; production flag read too early | Fixed |

## Screenshots

In `docs/screenshots/` (1× scale; phone images are full-page captures, so the
sticky header appears mid-image where the capture stitched).

| Area | Files |
| ---- | ----- |
| Homepage | `storefront-home-{desktop,mobile}.png` |
| Shop, product, sold-out product | `storefront-shop-*`, `storefront-pdp-*`, `storefront-pdp-soldout-*` |
| Cart and drawer, phone menu | `storefront-cart-*`, `storefront-cart-drawer-*`, `storefront-menu-mobile.png` |
| Community, contact, size guide, returns, about | `storefront-community-*`, `storefront-contact-*`, `storefront-size-guide-*`, `storefront-returns-*`, `storefront-about-*` |
| Checkout and confirmation | `checkout-{desktop,mobile}.png`, `checkout-confirmed-*` |
| Account | `account-login-*`, `account-register-*` |
| Back office | `admin-overview.png`, `admin-products.png`, `admin-orders.png`, `admin-promotions.png`, `admin-content.png`, `admin-settings.png` |

The storefront images were captured before the last round of fixes (white form
fields, two-decimal prices); the checkout, account and admin images are current.

## Not tested

| Gap | Why it matters | Plan |
| --- | -------------- | ---- |
| Real Stripe (test mode): success, decline, 3-D Secure, refund | The only path that takes money | First task once keys exist |
| A PostgreSQL server | Connection pooling, TLS, true concurrency | Run the suite against a database branch |
| Concurrency under load | PGlite is single-connection, so the "last unit" guarantee is proven by SQL semantics and sequential contention, not by simultaneous connections | Load test on real PostgreSQL |
| Real Shopify exports | Column quirks in this store's data | Dry run with the owner |
| Email deliverability | Spam placement, domain authentication | After the sending domain is verified |
| Full accessibility audit (screen reader, contrast measurement) | Legal and usability | Before launch |
| Core Web Vitals on a deployed site | Performance budget | After staging deploy |
| Cross-browser (Safari, Firefox) | iPhone Safari is most of the audience | Before launch |
