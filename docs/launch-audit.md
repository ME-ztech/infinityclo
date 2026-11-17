# Launch Audit

Audited 2026-11-16/17 against commit `077bde3` on `main` plus the hardening in
this change.

## Verdict

**The platform is launch-ready as software and not yet launchable as a
business.** Every part that can be built and proven without the owner's
accounts is built, merged to `main`, green in CI and verified in a real
browser. What remains is external: accounts, keys, rates and data that only the
owner can supply, followed by verification against those real services.

Nothing in this audit took a real payment, touched real customer data, wrote to
Shopify or changed production traffic.

## What was done in this pass

| Item | Result |
| ---- | ------ |
| Default branch | `main` (was `claude/infnity-storefront-1-0-tyy0zy`) |
| Pull request | [ME-ztech/infinityclo#3](https://github.com/ME-ztech/infinityclo/pull/3) merged into `main` |
| CI on the pull request | Pass — typecheck, lint, tests, dependency audit, build, browser tests |
| CI on `main` after merge | Pass |
| Vercel deployments | Both connected projects deploy successfully (one was failing; fixed — see findings) |
| Viewed in the owner's Chrome | Local production build and the deployed build |
| End-to-end purchase in Chrome | Completed: order `#1001`, then fulfilled in the back office |

## How it was audited

| Method | Scope | Notes |
| ------ | ----- | ----- |
| **Chrome, by hand** (Claude in Chrome extension, the owner's browser) | Storefront pages, a full purchase, back-office sign-in, order fulfilment, every admin screen, the deployed build | The extension's *screenshot* capture timed out on every site including example.com, so pages were inspected through the live DOM instead of pictures. Navigation and in-page inspection worked normally. |
| **Automated browser suite** (Playwright driving installed Chrome, production build) | 91 tests, desktop 1440 px and Pixel 7 | `npm run e2e` |
| **Page audit script** (`scripts/audit-deployed.mjs`) | 10 pages × 2 viewports: status, console errors, failed requests, overflow, images, headers, screenshots | Screenshots in `docs/screenshots/audit/` |
| **Unit and integration tests** | 274 tests on embedded PostgreSQL | `npm test` |
| **CI** | All of the above on GitHub's runners | `.github/workflows/ci.yml` |

## Results

### Storefront — viewed in Chrome

| Page | Result |
| ---- | ------ |
| Home | One `h1`; hero with 3 slides; pause toggles to play; statement, latest drop, Vault, lookbook, community, newsletter present; 40 images, none broken, all with alt text; no unlabelled controls; no sideways overflow (checked up to 3440 px wide) |
| Shop | 33 products; no overflow; no broken images |
| Product (in stock) | `$29.99 CAD`, was `$60.00`; five sizes selectable; `Add to cart — $29.99`; Fabric and Shipping & Returns sections (Fit and Care correctly absent — not supplied); 4 recommendations; Product structured data |
| Product (sold out) | Every size marked unavailable; button reads "Sold out" and is disabled; size guide offered |
| Routes | All public pages 200; unknown product 404; legacy paths redirect; `/admin` and `/account/orders` redirect to sign-in; maintenance endpoint 401 without its secret |
| Console | No errors |
| Customer-facing copy | No mention of Shopify |

### Purchase — performed in Chrome

| Step | Observed |
| ---- | -------- |
| Add size M to cart | Cart count 1 |
| Cart | 1 line, subtotal `$29.99`, "calculated at checkout" disclaimer, no upsell rail (off by default) |
| Checkout opens | Subtotal `$29.99`; shipping shows "Enter your address" — nothing promised early; page is `noindex` |
| Address entered | Shipping `$12.00`; GST 5% `$2.10`; total `$44.09` |
| Code `E2E10` | Discount `−$3.00`; total `$40.94` |
| Payment | Clearly labelled **Test mode**; button `Pay $40.94` |
| Confirmation | "Order confirmed `#1001`"; cart emptied |

Arithmetic check: 29.99 − 3.00 = 26.99; + 12.00 = 38.99; GST 5% = 1.95; total
40.94. Correct to the cent.

### Back office — performed in Chrome

| Step | Observed |
| ---- | -------- |
| `/admin` signed out | Redirected to sign-in |
| Sign in | Banner: "staging — INFNITY database for this environment, not the live store"; identity and role shown; `noindex` |
| Overview | Revenue `$0.00`, 0 orders — correct: the only order is a test order and test orders are excluded |
| Orders | `#1001`, badged Test / Paid / Unfulfilled, `$40.94` |
| Order detail | Subtotal, discount with code, shipping, tax and total match the checkout exactly |
| Fulfil with tracking | "Fulfilled with tracking … Shipping email sent"; shipment listed with carrier and number; "Mark delivered" offered, not assumed |
| Inventory | Uncounted variants labelled "Quantity unverified" |
| All 15 admin screens and 3 CSV exports | 200 |

### Deployed build — viewed in Chrome

`main` deployment on Vercel: homepage, shop, product, community, contact, size
guide, returns, cart and sign-in all 200; legacy redirect works; unknown product
404; `/admin` redirects. Checkout answers **"Checkout is not open yet"** (409)
— correct, because no database, payment provider or shipping rate is configured
there. The site does not pretend it can take an order.

### Automated page audit — local production build

All 20 page/viewport combinations: status 200, one `h1`, no overflow, no broken
images, no image without alt text, **zero console errors, zero failed
requests**.

Timings were measured on the same machine as the server, so they show that
nothing is slow in the application itself, not what a customer on a phone
network will see. Homepage transfer is about 390–430 kB including photography.
Real-world Core Web Vitals must be measured on the public site.

### Security headers

| Header | Value |
| ------ | ----- |
| Content-Security-Policy | `default-src 'self'`; scripts and frames limited to this site and Stripe; `frame-ancestors 'none'`; `object-src 'none'`; `form-action 'self'` |
| Strict-Transport-Security | 2 years, subdomains, preload |
| X-Frame-Options | `DENY` |
| X-Content-Type-Options | `nosniff` |
| Referrer-Policy | `strict-origin-when-cross-origin` |
| Permissions-Policy | Camera, microphone, geolocation off; payment limited to this site and Stripe |
| X-Powered-By | Removed |
| Cache-Control on account, admin, checkout | `private, no-store` |

### Test totals

| Suite | Result |
| ----- | ------ |
| Typecheck | 0 errors |
| Lint | 0 errors, 3 intentional warnings |
| Unit and integration | 274 passed |
| Browser (production build) | 91 passed; 23 skipped by design (viewport-specific) |
| Dependency audit, production | 0 advisories |
| Production build | Pass |

## Findings from this audit

| # | Finding | Severity | Status |
| - | ------- | -------- | ------ |
| 1 | No security headers; framework advertised in `X-Powered-By` | High | **Fixed** |
| 2 | A malformed `NEXT_PUBLIC_SITE_URL` crashed the build — this is what failed one Vercel project | High | **Fixed**: a bare host gets `https://`, anything unusable falls back. The variable on that project is still wrong and should be corrected. |
| 3 | The storefront header, footer and cart drawer were rendered underneath the back office — invisible but reachable by keyboard and screen reader | Medium | **Fixed** |
| 4 | Image sources allowed the legacy store's CDN, a runtime dependency on Shopify | Medium | **Fixed**: files on this site only, plus hosts explicitly opted in |
| 5 | An automated audit of the deployment measured Vercel's sign-in page and reported it clean | Medium (process) | **Fixed**: the script now refuses a URL that does not serve the storefront. The invalid results were discarded. |
| 6 | Three advisories in transitive dependencies | Medium | **Fixed** earlier with `npm audit fix` |
| 7 | Merging to `main` produced *Preview* deployments, not Production | Info | Vercel still treats the old branch as production. No production traffic changed. Owner action below. |
| 8 | The repository is **public** | Decision | Source code, and the community photographs of customers, are publicly readable. Owner decision below. |
| 9 | A remote branch `claude/charming-knuth-7lofqd` holds an earlier Shopify-based build from another session | Info | Not touched. Superseded; safe to delete. |
| 10 | Two Vercel projects (`infinityclo`, `infinityclo-j2pp`) build every commit | Info | Keep one. |
| 11 | The Chrome extension cannot capture screenshots on this machine | Info (tooling) | Worked around; not a platform issue |
| 12 | Content policy uses `'unsafe-inline'` for scripts | Low | Required by the framework's inline bootstrap. Per-request nonces are the next hardening step. |

## External requirements

Nothing below can be done from the repository. Each needs the owner's account
or decision. In order.

### A. Must exist before any real order

| # | Requirement | Where | Then |
| - | ----------- | ----- | ---- |
| 1 | **PostgreSQL database** for production, and one for staging | Neon (or any PostgreSQL 15+). Turn on point-in-time recovery for production. | Set `DATABASE_URL`; run `npm run db:migrate`, `npm run db:seed` |
| 2 | **Stripe account**, business verified | stripe.com | Set `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (test keys on staging, live on production) |
| 3 | **Stripe webhook** | Stripe → Developers → Webhooks → `https://<site>/api/webhooks/stripe`, events `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled` | Set `STRIPE_WEBHOOK_SECRET` |
| 4 | **Email provider** with a verified sending domain | Resend; add its DNS records to `infinityclo.ca` | Set `RESEND_API_KEY`, `EMAIL_FROM`, `CONTACT_TO_EMAIL` |
| 5 | **Admin owner account** for production | `npm run admin:setup -- <email>` | Set `ADMIN_OWNER_EMAIL`, `ADMIN_OWNER_PASSWORD_HASH`, `SESSION_SECRET` |
| 6 | **Shipping rates** | Admin → Settings → Shipping | Checkout stays closed until one exists |
| 7 | **Tax decision** from an accountant: is INFNITY registered for GST/HST, and which rates apply | Admin → Settings → Tax | Enter confirmed rates, or deliberately none |
| 8 | **Real stock counts** | Shopify → Products → Inventory → Export | `npm run db:inventory -- <csv>`; 92 variants currently sell uncounted |
| 9 | **Maintenance schedule** | Vercel Cron, every 10 minutes, `GET /api/cron/maintenance` | Set `CRON_SECRET` |

### B. Hosting set-up

| # | Requirement |
| - | ----------- |
| 10 | Choose **one** Vercel project and remove the other |
| 11 | Set that project's **Production Branch** to `main` |
| 12 | Correct `NEXT_PUBLIC_SITE_URL` on the project (it must be a full URL such as `https://infinityclo.ca`) and set `APP_ENV` per environment |
| 13 | Add a Vercel Firewall rate-limit rule for `/api/*`, `/account/*` and `/admin/login` |
| 14 | Decide whether the GitHub repository should be **private** |
| 15 | Delete the superseded branch `claude/charming-knuth-7lofqd` and the old default branch once you no longer need them |

### C. Migration (needs the owner's exports)

| # | Requirement |
| - | ----------- |
| 16 | Export customers and orders from Shopify; dry-run and reconcile (`migration-plan.md`) |
| 17 | Re-create wanted discount codes as offers in the admin |
| 18 | Check for outstanding gift cards or store credit in Shopify |
| 19 | Draft the email telling customers how to set a password on the new site |

### D. Legal and brand

| # | Requirement |
| - | ----------- |
| 20 | Review shipping, returns and terms; **rewrite the privacy policy** to name Stripe, the database host and the email provider in place of Shopify |
| 21 | Confirm the 34 community-wall photographs may be carried over; hide any that should not be |
| 22 | Confirm the official spelling — INFNITY or INFINITY |
| 23 | Supply a vector logo and original campaign photography (`assets-and-rights.md`) |
| 24 | Supply the missing size charts, including the women's guide, and fit and care copy |
| 25 | Confirm that every "was" price is a genuine former price |

### E. Approvals reserved to the owner

Taking the first live payment, pointing `infinityclo.ca` at the new platform,
emailing customers, and closing Shopify.

## To do — engineering, after the accounts exist

| # | Task | Why | Size |
| - | ---- | --- | ---- |
| 1 | Stripe test-mode run: success, decline, 3-D Secure, abandoned, refund, partial refund | The payment path has never executed against Stripe | 1 day |
| 2 | Run the test suite against a PostgreSQL server | Proven so far only on the embedded engine | 3 h |
| 3 | Migration rehearsal on real exports; adjust importers | Tested only on synthetic rows | 1–2 days |
| 4 | One real purchase and refund in live mode | Final proof; needs approval | 1 h |
| 5 | Error monitoring, uptime checks, alert routing | Nobody is told today if checkout breaks | 6 h |
| 6 | Stripe reconciliation report (orders vs. charges) | Catch any payment without an order | 1 day |
| 7 | Backup restore drill | A backup is only real once restored | 3 h |
| 8 | Load test of a drop on real PostgreSQL | The last-unit guarantee is proven by SQL semantics, not under simultaneous connections | 1 day |
| 9 | Core Web Vitals on the public site; Safari and Firefox pass | Most customers are on iPhone Safari | 1 day |
| 10 | Full accessibility audit with a screen reader | Checked structurally, not by assistive technology | 1 day |
| 11 | Content policy with per-request nonces | Remove `'unsafe-inline'` | 1 day |
| 12 | Runbooks: checkout down, webhook failing, oversell, dispute | Operations | 5 h |

After launch: photo upload from the admin, staff two-factor authentication,
carts that follow a signed-in customer across devices, customer erasure and
export buttons, a launch-scheduling field in the admin, a restock tick-box on
refunds, post-purchase recommendations.

## What "launch-ready" does and does not mean here

It means: the storefront, checkout, accounts, back office and migration tools
exist, are tested, are merged and are deployable; the site is secure by
default, honest about what it cannot yet do, and closed for orders until it can
complete one.

It does not mean orders can be taken today. The single largest unproven piece
is real payment. Until item 1 of the to-do list passes, treat checkout as
untested against money.
