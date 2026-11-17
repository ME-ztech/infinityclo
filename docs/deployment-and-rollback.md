# Deployment and rollback

## Status

- The application builds and runs from a clean checkout (`npm ci && npm run build && npm start`).
- **No staging or production deployment was made from this session**: there are no Vercel (or other host) credentials in the environment. The local production preview used for testing is described in `test-evidence.md`.
- Nothing has been changed on the live Shopify store, its theme, domain or DNS.

## 1. Staging (Vercel preview) — owner steps

1. **Database.** Vercel → Storage → create a **Neon Postgres** database (or any Postgres 15+). Copy its pooled `DATABASE_URL` (with `sslmode=require`). Migrations run automatically on first request (advisory-locked, safe for concurrent cold starts).
2. **Import the project** `ME-ztech/infinityclo` in Vercel, framework Next.js (defaults are correct: `npm ci`, `next build`).
3. **Environment variables** (Preview environment first), from `.env.example`:
   - Required: `DATABASE_URL`, `APP_SECRET` (`openssl rand -base64 48`), `NEXT_PUBLIC_SITE_URL` (the preview URL), `NEXT_PUBLIC_NOINDEX=true` for staging.
   - First owner: `ADMIN_BOOTSTRAP_EMAIL` + `ADMIN_BOOTSTRAP_PASSWORD` (remove after first sign-in), or run `npm run admin:create-owner` against the database.
   - Shopify (as they become available): `SHOPIFY_STORE_DOMAIN=apparelinifinty85.myshopify.com`, `SHOPIFY_STOREFRONT_ACCESS_TOKEN`, `SHOPIFY_ADMIN_ACCESS_TOKEN`, `SHOPIFY_WEBHOOK_SECRET`, `SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID` (+ `_SECRET`).
   - Checkout: leave `CHECKOUT_MODE` unset (auto: Storefront when a token exists, otherwise disabled). Use `permalink` only if you deliberately want staging to hand off to the live Shopify checkout before tokens exist.
   - Email (optional): `RESEND_API_KEY`, `EMAIL_FROM`.
4. Deploy the branch `claude/charming-knuth-7lofqd`. Check: `/`, `/shop`, a product, cart → checkout button state, `/admin` sign-in, `/admin/settings` health panel.
5. **Customer accounts on staging**: add `https://<preview-host>/account/callback` and the logout URL in Shopify → Headless → Customer Account API settings (HTTPS required; localhost is not accepted by Shopify).
6. **Webhooks**: in the Shopify custom app, subscribe `products/*`, `inventory_levels/update`, `orders/*`, `fulfillments/*`, `refunds/create`, `customers/create|update`, and the mandatory privacy topics to `https://<host>/api/webhooks/shopify` (API version 2026-10).

## 2. Production cutover (requires explicit owner go-ahead)

The current theme serves `infinityclo.ca` from Shopify. Shopify checkout must keep a Shopify-served domain after the storefront moves.

1. **Before DNS:** in Shopify → Settings → Domains, connect `shop.infinityclo.ca` (CNAME `shops.myshopify.com`) and make it the **primary domain** so checkout, customer accounts and order-status pages live there. Set `SHOPIFY_HOSTED_ACCOUNT_URL=https://shop.infinityclo.ca/account` if needed.
2. Add `infinityclo.ca` and `www.infinityclo.ca` to the Vercel project (Production) and set `NEXT_PUBLIC_SITE_URL=https://infinityclo.ca`, remove `NEXT_PUBLIC_NOINDEX`.
3. Lower the DNS TTL (e.g. 300 s) a day ahead. Switch the apex `A` / `www` `CNAME` to Vercel's values at a quiet hour.
4. Verify: homepage, three product pages, add to cart → checkout lands on `shop.infinityclo.ca` checkout, account sign-in round trip, `/admin`, legacy URLs (`/collections/all`, `/pages/customer-gallery`, `/policies/refund-policy`) return 308 to their new pages, `/sitemap.xml` lists products.
5. **SEO:** product URLs are unchanged (`/products/{handle}`). Submit the new sitemap in Google Search Console. Keep the old Shopify theme **unpublished but intact**.
6. Disable theme-only apps you no longer need (EcomSend pop-up, chatbot) after confirming replacements (newsletter is native; AVADA gift → native discount decision).

## 3. Rollback

| What broke | Rollback | Time |
| --- | --- | --- |
| A bad deploy | Vercel → Deployments → previous deployment → **Instant Rollback** | < 1 min |
| Storefront unusable after DNS cutover | Point `infinityclo.ca` DNS back to Shopify (`A 23.227.38.65`, `www CNAME shops.myshopify.com`) and re-select it as primary domain in Shopify; the old theme is still there | TTL (≈5 min) |
| Bad content edit | Re-edit in Admin → Content (each save is versioned in the audit log) | minutes |
| Bad promotion | Admin → Promotions → **End** (deactivates the Shopify discount) or deactivate in Shopify admin | < 1 min |
| Bad product edit | Edit again in Admin or Shopify admin; Shopify keeps product history in its admin timeline | minutes |
| Database problem | Neon point-in-time restore to before the incident (enable PITR on the paid plan), then redeploy | 10–30 min |

**Backups.** Shopify holds the commerce data. The app database holds CMS content, promotion drafts, consent records, community submissions, inbox, staff and audit; enable Neon PITR/backups and export subscribers regularly (Admin → Marketing).

## 4. Migrations

- Schema in `src/server/db/schema.ts`; SQL migrations in `src/server/db/migrations/` (generated with `npm run db:generate`), applied automatically at runtime under a Postgres advisory lock.
- Additive changes only on live data; destructive changes need a two-step migration and a backup first.

## 5. Change log

| Commit range | Change | Rollback |
| --- | --- | --- |
| Phase 0 | Audit docs, CAD-pinned catalogue import | Revert commit |
| Platform | App DB (new tables only), Shopify clients, checkout hand-off | Drop the app DB; Shopify untouched |
| Storefront 2.0 | Theme, hero, pages | Vercel rollback |
| Back office | Admin modules | Vercel rollback |
| E2E | Tests and a11y fixes | — |
