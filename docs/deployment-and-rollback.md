# Deployment and Rollback

## Environments

| Environment | Purpose | Shopify data | Admin mode |
| ----------- | ------- | ------------ | ---------- |
| Local (`npm run dev`) | Development | Live catalogue (read-only) or snapshot | Sandbox |
| **Staging** (Vercel preview) | Owner UAT | Live catalogue (read-only) | Sandbox until the Admin token is added |
| **Production** | Customers | Live | Shopify |

The storefront only ever **reads** from Shopify. The only writes are made from
`/admin`, by a signed-in member of staff, when an Admin API token is configured.

## Local preview

```bash
npm ci
```

```bash
npm run admin:setup -- you@example.com
```

```bash
npm run dev
```

Storefront: `http://localhost:3000`. Dashboard: `http://localhost:3000/admin`.
`admin:setup` writes a generated owner password hash and session secret to
`.env.local` and prints the password once. Add `COMMERCE_ADMIN_MODE=sandbox` to
`.env.local` to use the dashboard without touching the real store.

## Staging deployment (Vercel)

No deployment was made from the build session: publishing a site is an
outward-facing action and needs the owner's Vercel account.

1. Import `ME-ztech/infinityclo` into Vercel. Framework preset: Next.js. No
   overrides.
2. Set the branch to `claude/charming-knuth-7lofqd`, or merge it first.
3. Add a KV store: Vercel → Storage → Create → Upstash for Redis. Vercel injects
   `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
4. Add the environment variables below.
5. Deploy. Vercel gives the preview URL.

### Environment variables

| Variable | Staging | Production | Notes |
| -------- | ------- | ---------- | ----- |
| `NEXT_PUBLIC_SITE_URL` | The preview URL | `https://infinityclo.ca` | Canonical URLs, sitemap, OAuth redirect |
| `SESSION_SECRET` | Required | Required | 32+ random characters. Different per environment |
| `ADMIN_OWNER_EMAIL` | Required | Required | |
| `ADMIN_OWNER_PASSWORD_HASH` | Required | Required | From `npm run admin:setup`. A hash, never the password |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Required | Required | Without them admin changes do not persist on Vercel |
| `COMMERCE_ADMIN_MODE` | `sandbox` | unset | Sandbox never contacts the real store's Admin API |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | Leave unset for first UAT | Required | Server-side only |
| `SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID` | Optional | Recommended | Customer sign-in on this site |
| `SHOPIFY_WEBHOOK_SECRET` | Optional | Recommended | |
| `SHOPIFY_STOREFRONT_PRIVATE_TOKEN` | Optional | Optional | Raises Storefront API limits |
| `SHOPIFY_CHECKOUT_DOMAIN` | unset | Optional | Defaults to the permanent `*.myshopify.com` domain |
| `RESEND_API_KEY`, `CONTACT_TO_EMAIL`, `EMAIL_FROM` | Optional | Optional | Contact form email |
| `NEXT_PUBLIC_CHECKOUT_ENABLED` | `false` to make staging browse-only | unset | Unset means checkout is on |

Never commit a value for any of these. `.env*.local` is git-ignored.

### Staging and real checkout

Checkout on staging goes to the **real** Shopify checkout, because that is the
only checkout there is. Completing it would create a real order and a real
charge. For UAT either set `NEXT_PUBLIC_CHECKOUT_ENABLED=false`, or stop at the
Shopify checkout page, or use a Shopify test payment method that the owner has
deliberately enabled. No real charge is to be made without the owner's say-so.

## Production cutover

Do these in order. Steps 1–5 are reversible and invisible to customers.

1. **Back up.** Shopify admin → Products → Export (CSV); Customers → Export;
   Orders → Export. Online Store → Themes → duplicate the live theme.
2. **Create the custom app** and tokens (see `launch-checklist.md`).
3. **Deploy production** on Vercel with production variables. It is reachable at
   its `*.vercel.app` URL only.
4. **Smoke test on the Vercel URL** (list below).
5. **Lower DNS TTL** on `infinityclo.ca` to 300 seconds, a day ahead.
6. **Owner go-ahead.** Nothing past this line happens without it.
7. **Point the domain.** Add `infinityclo.ca` and `www` to the Vercel project;
   change the DNS records to Vercel's. In Shopify → Settings → Domains, the
   store keeps `apparelinifinty85.myshopify.com`; optionally add
   `checkout.infinityclo.ca` as a Shopify domain and set
   `SHOPIFY_CHECKOUT_DOMAIN` to it so checkout stays on-brand.
8. **Update Shopify links** so emails point at the new site: Customer Account
   API application URLs, and the Headless channel's storefront URL.
9. **Search Console:** submit `https://infinityclo.ca/sitemap.xml`.
10. **Watch** for 48 hours: orders arriving in Shopify, webhook receipts in
    `/admin → Settings`, 404s in Vercel logs.

### Smoke test

| Check | Expected |
| ----- | -------- |
| `/` | Hero, products with prices, no console errors |
| `/shop` → filter → product | Real products, CAD prices |
| Sold-out size on a product | Struck through, cannot be added |
| Add to cart → cart → Checkout | Lands on Shopify checkout with the same items and quantities |
| `/products/<legacy handle>` | 200 |
| `/collections/all`, `/pages/contact`, `/policies/refund-policy` | 308 to the new path |
| `/sitemap.xml`, `/robots.txt` | Present; `/admin` disallowed |
| `/admin` signed out | Redirects to sign-in |
| `/admin → Settings` | Each integration shows its true state |
| Newsletter signup | Appears in `/admin → Marketing` |
| Edit a hero title in admin | Visible on `/` |

## SEO continuity

- `/products/<handle>` is unchanged, so product rankings carry over.
- Permanent redirects cover the legacy collection, page and policy paths
  (`next.config.ts`).
- Canonical tags, product structured data and a generated sitemap are in place.
- `/admin`, `/account`, `/cart`, `/api` and drop previews are not indexable.

## Rollback

The Shopify theme and store are never modified by the cutover, so rollback is a
DNS change.

| Situation | Action | Time |
| --------- | ------ | ---- |
| Bad deploy, domain already on Vercel | Vercel → Deployments → previous deployment → Promote | Seconds |
| The new site must come down entirely | Point `infinityclo.ca` DNS back to Shopify (A `23.227.38.65`, `www` CNAME `shops.myshopify.com`); set it as primary in Shopify → Domains | DNS TTL (5 min if lowered) |
| A discount was activated by mistake | `/admin → Promotions → Pause`, or Shopify admin → Discounts → Deactivate | Immediate |
| A product edit was wrong | Edit it back in `/admin` or Shopify; or re-import from the step-1 CSV | Minutes |
| Admin credentials suspected leaked | Rotate `SESSION_SECRET` (signs everyone out), re-run `admin:setup`, rotate the Shopify Admin token in the custom app | Minutes |

Orders, customers and inventory live in Shopify throughout; no rollback can lose
them.

## Data migrations and change log

| Date | Change | Reversible by |
| ---- | ------ | ------------- |
| 2026-11-16 | Catalogue snapshot and photography imported into the repository | `git revert` |
| 2026-11-16 | Brand assets and community wall imported | `git revert` |
| 2026-11-16 | Catalogue switched from snapshot to live Shopify with snapshot fallback | `SHOPIFY_LIVE_CATALOG=off` |
| 2026-11-16 | Checkout enabled via Shopify handoff | `NEXT_PUBLIC_CHECKOUT_ENABLED=false` |

No change in this project has written to the Shopify store.

## Operational notes

- **Rate limiting** is per server instance. On Vercel add a WAF rate-limit rule
  for `/api/*` and `/admin/login` for defence in depth.
- **Uploads** (community photos) need a durable disk. On Vercel the upload
  endpoint reports itself unavailable rather than losing files; use a host with
  a volume, or add object storage, to enable it.
- **Catalogue cache** is 60 seconds; webhooks invalidate it immediately.
- **Re-import** photography after adding many products: `npm run import:catalog`
  then commit `public/products` and `src/data/catalog`.
