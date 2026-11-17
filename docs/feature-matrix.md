# Feature matrix

Legend — **Implemented**: code exists and runs. **Tested**: covered by an automated test (U = unit/integration with Vitest, E = Playwright end-to-end, M = mocked Shopify transport). **Live-verified** means exercised against the real Shopify store; nothing in this build is live-verified against Shopify Admin, Storefront or Customer Account APIs because no credentials were provided (see `launch-checklist.md`).

| # | Requested feature | Implemented | Tested | Limitations / gate | Source of truth |
|---|---|---|---|---|---|
| D1 | Sticky header: Home, Shop, Styled By You, Contact, Account, Search, Cart (live count); centred brand mark; mobile slide-out menu | Yes | E (desktop + Pixel 7) | — | Owner notes, legacy store |
| D2 | Campaign hero slideshow: owner photography, lineup on desktop / focal crop on phone, slogan "Be the Statement", stacked statements bottom-left, CTA + "Styled by community", pause/play, reduced motion, lazy non-initial slides, CMS-editable | Yes | E | Uses studio product photography; original campaign shoots requested | CMS (`hero`) |
| D3 | Homepage sections in brief order, CMS-reorderable and toggleable | Yes | E (order) | — | CMS (`homepage`) |
| D3.3 | Featured/new products with live price, badges, stock | Yes | E | Stock is in-stock/sold-out only until Admin/Storefront connected | Snapshot → Storefront API |
| D3.7 | Coming soon teaser + waitlist, countdown only when date confirmed | Yes | U, E | — | App DB (`drops`) |
| D3.8 | Newsletter with explicit consent and confirmation | Yes | U, E | Double opt-in emails need `RESEND_API_KEY` | App DB + Shopify consent (when connected) |
| D3.9 | Footer: shop, story, contact, size guide, account, order tracking, shipping, returns, privacy, terms, socials, CAD/Canada | Yes | E (all links resolve) | Facebook URL unverified (owner setting) | Settings |
| D4 | Shop: categories (tops, hoodies, bottoms, accessories), filters (size, colour, price, availability), sort, search, legacy slugs preserved + redirects | Yes | E | "Best selling" sort not offered (no sales data without Admin API) | Catalogue |
| D5 | PDP: gallery, CAD price, compare-at only when higher, per-variant availability, square size buttons, sold-out struck + disabled, `ADD TO CART — $XX.XX`, Continue shopping, FIT/FABRIC/CARE/SHIPPING accordions, description at bottom, size guide, colour siblings, You may also like (purchasable only), JSON-LD | Yes | U, E | Facts only where the brand published them; others say "not published yet" | Catalogue + `infnity.*` metafields |
| D5 | Women's size guide | Model supports it (`audience`) | — | **No brand data exists** — not invented; size guide page says so | Brand |
| D6 | Mini-cart + cart page, update/remove, persistence, guest | Yes | E | — | Browser (identities) + server pricing |
| D6 | Checkout hand-off (no client prices; sold-out/unknown refused) | Yes | U, E (intercepted) | Storefront mode needs token; permalink mode available now. **No payment executed** | Shopify checkout |
| D6 | 10% offer (first-order/sitewide), draft until owner approval + margin check | Yes | U, E | Code not chosen by owner → cannot be approved yet | App DB → Shopify discount |
| D6 | Bundle offers with eligibility, stacking, savings maths | Yes | U, E | Bundle value not decided by owner → draft | App DB → Shopify discount |
| D6 | Upsell: PDP on; cart upsell switch (default off per follow-up notes) | Yes | E (PDP) | — | Settings |
| D6 | Abandoned checkout recovery | Designated to Shopify (documented, no duplicate sender) | — | Owner enables in Shopify | Shopify |
| D7 | Styled By You: legacy wall imported, moderated submissions with consent, EXIF stripping | Yes | U, E | Legacy wall consent "implied" — owner to confirm | App DB |
| D7 | Brand story from verified words only | Yes | E | Founder story awaits owner (`BRAND_STORY_INPUTS_NEEDED.md`) | Brand |
| D7 | Contact form → staff inbox, spam protection (honeypot + rate limit) | Yes | E | Email notification needs provider | App DB |
| D7 | Policies | Merchant's published Shopify policies, verbatim, flagged for legal review | E | Inconsistencies listed in `source-audit.md` | Shopify |
| E | Customer sign-in (passwordless, Customer Account API, PKCE), account overview, orders, order detail, tracking, delivery progress on evidence, addresses, consent status, return/help request | Yes | U, M | **Needs** new customer accounts + client id; until then hosted Shopify account pages | Shopify |
| E | Customer isolation | Token-scoped queries only; no-store | U (redirect/claims) | Live verification pending credentials | Shopify |
| E | Profile/address editing | View only | — | Edits happen in Shopify-hosted account for now | Shopify |
| E | Wishlist | Yes (browser-saved) | — | Not synced across devices | Browser |
| F | Admin auth, RBAC (Owner, Operations, Content, Support), audit log, lockout, rate limits | Yes | U, E | — | App DB |
| F1 | Overview: revenue, paid orders, awaiting fulfilment, low stock, sign-ups, waitlists | Yes | E (render) | Shopify figures need Admin API | Shopify + App DB |
| F2 | Products: create/edit/duplicate/archive/draft/publish, variants, SKU, barcode, weight, compare-at, images (upload/URL), facts, size guide, SEO, channels | Yes | M | **Needs Admin API**; disabled with explanation until then | Shopify |
| F3 | Inventory per variant/location, low-stock, compare-and-set restock | Yes | M | Needs Admin API | Shopify |
| F4 | Orders: search/filter/export, detail, notes/tags, fulfil with tracking, cancel/refund **requests** | Yes | — (render needs API) | Needs Admin API. Refunds/cancels executed in Shopify admin by design | Shopify |
| F5 | Customers: search, profile, orders, notes/tags, consent, owner-only export | Yes | — | Needs Admin API | Shopify |
| F6 | Promotions: drafts, approval, publish, pause/resume/end, live discount list | Yes | U, E, M | Publishing needs Admin API | App DB → Shopify |
| F7 | Content CMS: hero, homepage order/copy, announcement, lookbook | Yes | U, E | — | App DB |
| F8 | Community moderation | Yes | U, E | — | App DB |
| F9 | Marketing: consent ledger, exports, provider status, email log | Yes | E (render) | — | App DB |
| F10 | Analytics: sales, AOV, top SKUs, codes, refunds; sessions marked "not instrumented" | Yes | — | Needs Admin API; no tracking script installed | Shopify |
| F11 | Settings: store details, switches, integration & secret health (names only), staff management | Yes | E | — | App DB / env |
| G | Drop engine lifecycle, waitlist dedupe/export, confirmed-only countdown, product link | Yes | U, E | Scheduled publication relies on Shopify product scheduling (not automated here) | App DB + Shopify |
| H | Asset audit + manifest | Yes | — | See `assets-and-rights.md` | — |
| I | CAD default, CA market pinned, taxes/shipping only at Shopify checkout | Yes | U (importer guard) | US market exists in Shopify — owner decision | Shopify |
| J | Webhooks: HMAC, idempotency ledger, privacy topics, cache refresh | Yes | U | Subscriptions to be registered with credentials | Shopify |
| J | Security headers, noindex admin/account, same-origin checks, CSV injection guard | Yes | E (noindex) | — | — |
| J | SEO: canonical, sitemap, robots, product JSON-LD, OG, legacy redirects | Yes | E | — | — |
