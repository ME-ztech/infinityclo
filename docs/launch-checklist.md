# Launch checklist

**READY** = built and tested here. **NEEDS OWNER ACTION** = a decision, asset or account step only the owner can take. **BLOCKED** = cannot be completed until the listed item exists.

## READY

- [x] Storefront: white editorial theme, centred brand header, hero slideshow, homepage sections in brief order, shop/search/filters, PDP with accordions and size guides, cart, Styled By You, lookbook, coming soon, policies, FAQ, contact — real catalogue (33 products) and photography.
- [x] Checkout hand-off code for Shopify-hosted checkout (Storefront Cart API or cart permalink); server re-prices; sold-out and unknown variants refused.
- [x] Customer account portal code (Customer Account API, PKCE, orders, tracking, evidence-based delivery states); hosted-account fallback works now.
- [x] Back office: 13 modules, RBAC with 4 roles, audit log, CMS, promotions approval workflow, drops/waitlists, community moderation, inbox, marketing consent ledger, exports, staff management.
- [x] Webhook endpoint with HMAC verification and idempotency; mandatory privacy topics handled.
- [x] Security headers, noindex for admin/account/staging, rate limits, same-origin checks, sealed cookies, scrypt, CSV-injection guard.
- [x] SEO: canonical URLs, sitemap, robots, product JSON-LD, Open Graph, permanent redirects from legacy Shopify URLs; product handles unchanged.
- [x] Tests: typecheck, lint, 130 unit/integration, 100 E2E, axe AA — all green (`test-evidence.md`).

## NEEDS OWNER ACTION — Shopify access (exact steps)

1. **Storefront API + Customer Account API** — Shopify admin → _Sales channels_ → install **Headless** → _Create storefront_:
   - Copy the **Storefront API public access token** → `SHOPIFY_STOREFRONT_ACCESS_TOKEN`.
   - _Customer Account API settings_: copy **Client ID** (and secret if "Confidential") → `SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID` / `_SECRET`; add callback `https://<site>/account/callback`, logout URL `https://<site>/`, JavaScript origin `https://<site>`.
2. **New customer accounts** — _Settings → Customer accounts → Edit → "Customer accounts"_ (the store currently uses classic accounts; required for item 1's sign-in).
3. **Admin API** — _Settings → Apps and sales channels → Develop apps → Create app_ "INFNITY back office" → Admin API scopes:
   `read_products, write_products, read_inventory, write_inventory, read_locations, read_orders, write_orders, read_merchant_managed_fulfillment_orders, write_merchant_managed_fulfillment_orders, read_customers, write_customers, read_discounts, write_discounts, read_publications, write_publications, read_reports, read_markets, write_files, read_files`
   → install → **Admin API access token** → `SHOPIFY_ADMIN_ACCESS_TOKEN`; **API secret key** → `SHOPIFY_WEBHOOK_SECRET`.
   (Orders older than 60 days need `read_all_orders`, which Shopify grants on request.)
4. **Webhooks** — subscribe the topics in `deployment-and-rollback.md` §1.6 to `https://<site>/api/webhooks/shopify`.
5. **Infrastructure** — Vercel project, Neon Postgres (`DATABASE_URL`), `APP_SECRET`, first owner account; optional Resend (`RESEND_API_KEY`, `EMAIL_FROM` on a verified domain).

Enter secrets only in Vercel's environment settings — never in chat or in the repository.

## NEEDS OWNER ACTION — decisions

- [ ] **Brand spelling**: INFNITY / Infnity.clo (what the store and Instagram use) vs INFINITY (the brief). Default is INFNITY; change in Admin → Settings.
- [ ] **10% offer**: your follow-up notes say both "10% — scrap" and "persistent 10% discount". The first-order draft is ready but needs a **code** and your margin sign-off — or delete it.
- [ ] **Bundle of 2**: choose the saving (percent or $ off) and which products; then approve.
- [ ] **FREESKII gift (spend $100 → free socks)**: currently run by the AVADA app, which won't run on the new storefront. Recreate natively (draft ready) or retire.
- [ ] **Cart upsell**: notes ask "cart: no upsells?" — switch is **off**; turn on in Settings if wanted.
- [ ] **Markets**: Shopify has a **US/USD market** enabled. Confirm which countries you ship to and in which currency.
- [ ] **Policies (legal review)**: published policies conflict — shipping policy (2–3 days processing + 3–5 shipping) vs product pages ("ships within 3–5 business days"); returns only via Instagram DM; privacy policy lists three spellings of the contact email and mentions Stripe. Fix in Shopify → Settings → Policies (the site shows them verbatim).
- [ ] **Catalogue fixes** (from `source-audit.md`): LeCaptain America M priced $45.01; Iced Soft Blush XL $29.00 vs $29.99; sweatpants descriptions describe a hood; mismatched tee descriptions; third-party names in product titles (Lil Yachty, Lucki, Captain America) — legal check.
- [ ] **Community consent** for the 34 legacy wall photos (keep, confirm, or remove in Admin → Community).
- [ ] **Analytics**: no tracking script is installed. If you want GA4/Meta Pixel, add a consent banner first.
- [ ] **Abandoned checkout**: enable Shopify's automation (Marketing → Automations); the app deliberately sends none.

## NEEDS OWNER ACTION — assets

See `assets-and-rights.md` → _Missing asset requests_ (logo vectors, campaign originals, clean photos for sold-out pieces, missing garment facts and size charts incl. women's, next-drop details, founder story).

## BLOCKED until Shopify access (items 1–4 above)

- Live product/price/availability from Shopify (the imported snapshot is used meanwhile).
- Storefront-mode checkout and signed-in checkout identity (permalink mode works without a token, by owner choice).
- Customer sign-in, order history and tracking on `/account` (hosted Shopify account works meanwhile).
- Admin products, inventory, orders, fulfilment, customers, publishing promotions, sales analytics.
- Live verification of webhook delivery.

## Production go-live (explicit owner go-ahead required)

1. Staging deploy + owner UAT on phone and desktop (place one real low-value test order with a real card, then refund it in Shopify — **only with your approval**).
2. Shopify primary domain → `shop.infinityclo.ca`; then point `infinityclo.ca` at Vercel (`deployment-and-rollback.md` §2).
3. Post-cutover checks and Search Console sitemap; keep the old theme unpublished for rollback.
