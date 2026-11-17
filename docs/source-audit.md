# Source Audit

Audited 2026-11-16. Everything below was read first-hand from the source named;
nothing is reconstructed from memory. "Unknown" means not established, not
assumed.

## Source-of-truth table

| # | Source | Verified findings | Assets accessible | Rights / ownership | Reused | Still unknown |
| - | ------ | ----------------- | ----------------- | ------------------ | ------ | ------------- |
| 1 | **Repository** `ME-ztech/infinityclo` | Next.js 16 / React 19 / TypeScript strict / Tailwind v4 storefront (v1.1). Domain model, repository seam, cart, search, filters, 86 passing unit tests, Playwright suite. **No** commerce backend, payment code, database, auth, Shopify or Stripe integration, admin, or env secrets existed. Catalogue snapshot was empty (previous environment could not reach the store). | All source. | Owner's repository. | Whole codebase retained and extended; nothing replaced wholesale. | — |
| 2 | **Legacy store** `infinityclo.ca` (public pages and public JSON feeds only) | Shopify store "Infnity.clo", Winnipeg, Manitoba, CA. Currency CAD. Permanent domain `apparelinifinty85.myshopify.com`, shop id `60570697948`. Theme "eyeztheme" (EYEZY ULTIMATE 1.0.0, by eyecey.com). 33 published products, 1 published collection (`all`). Card brands Visa, Mastercard, Amex, Interac; Shop Pay Installments offered. Ships to ~230 country codes per `meta.json`. | 90 product photographs, 34 community-wall images, 4 size-chart graphics, emblem logo, homepage banner. All localised into `public/`. | Owner's store. Product and brand artwork: owner's. Community images: third-party customers, republished by the brand (see `assets-and-rights.md`). | Catalogue, prices, variants, availability, descriptions, policies, size charts, brand lines, community wall. | Order history, customers, discounts, inventory quantities, shipping rates, tax settings, markets — all private; need the owner's Shopify access. |
| 3 | **Inspiration** `unashamed.site` | Also a Shopify storefront. Structure: sticky header (Shop / Community / Story / Cart), full-bleed hero with rotating statement list, VIEW CTA and PAUSE control; featured products; lookbook; mission block; newsletter; three-column footer; Shopify-hosted customer login. Display + Archivo type pairing. | Viewed only. | **Third party. Not reusable.** | Layout ideas only: hero composition, section rhythm, PDP control styling. No text, photography, logo, scripture or code. | — |
| 4 | **Instagram** `@infnity.clo` | Not fetched: Instagram requires sign-in and scraping it is out of bounds. From the supplied screenshot: handle `infnity.clo`, display name "!nfnïty®", 132 posts, 1,312 followers, bio link `www.infinityclo.ca`, Threads `infnity.clo`, Facebook "Infinityapparelclo". The avatar is the same emblem as the store's header logo, and the store's own refund policy and community page name `@INFNITY.CLO` — ownership is corroborated by the owned site. | None (screenshot only). | Owner's account. Individual posts not verified. | Handle and profile URL as the one social link. Editorial direction (studio model shots, group shots, countdown tiles). | Whether Facebook/Threads URLs are current; original campaign files. |
| 5 | **Five supplied reference images** | Two handwritten requirement pages, Unashamed hero, Unashamed PDP, Instagram profile. | Read. | Requirements, not production assets. | Requirements only. | — |

## Legacy store — detail

### Navigation and structure

| Element | Legacy value |
| ------- | ------------ |
| Page title | "Be the Statement !!! – Infnity.clo" |
| Header | HOME (→ `/collections/all`), CONTACT US, SIGN UP (→ `/pages/jointhetroop`), STYLED BY YOU (→ `/pages/customer-gallery`), cart count |
| Homepage body | Two calls to action: `" ENTER THE VAULT "` (→ all products) and `" STYLED BY YOU "` (→ gallery) |
| Footer | Refund, Privacy, Terms, Shipping, Contact information |
| Store description | "Infnity.clo is where raw identity meets untouchable design. Built for the ones who don't fold, don't follow — and never settle. For the FLY only. Question is... you got what it takes to be one" |

### Pages (`/pages.json`)

| Handle | Title | Content |
| ------ | ----- | ------- |
| `customer-gallery` | THE TROOP IN INFNITY. | "WANNA BE ADDED TO THE WALL ?? POST AND TAG US @INFNITY.CLO TO BE HERE !!!!" + 34 images |
| `contact` | CONTACT US | Form only: name, phone, email, message. No address, phone or email published. |
| `jointhetroop` | JOIN THE TROOP | Empty body (theme signup form) |
| `tee-shirt-size-chart` | TEE SHIRT SIZE CHART | One graphic: "Infinity Summa 24' Tees" |
| `pullover-hoodies` | pullover hoodies | One graphic: "Pullover Hoodie" |
| `zip-up-hoodie-size-chart` | zip up hoodie size chart | One graphic: "Zip Hoodies" |
| `bottom-size-chart` | bottom size chart | One graphic: "Straight cut bottoms" |
| `bundle-of-2` | bundle of 2 | **Two size-chart graphics (zip hoodie + bottoms). No price, no discount, no offer text.** |

The brief asks to "preserve meaning if actively offered" for the `bundle of 2`
page. It is a sizing page for a two-piece set, not a pricing offer, and no
bundle discount is visible anywhere on the public store. No bundle price has
therefore been carried over. Bundle offers are built as an admin capability and
start as drafts.

### Policies (carried over verbatim in substance)

- **Shipping:** 2–3 business days to process, then 3–5 business days to ship.
  No rates, regions, carriers or free-shipping threshold are published.
- **Returns:** 10 days from receipt; unworn, tagged, original packaging, proof of
  purchase; started by messaging Instagram `@INFNITY.CLO`; accepted returns get a
  label; unrequested returns refused; no returns on sale items or gift cards;
  exchanges are return-then-repurchase; refunds to the original payment method.
- **Privacy:** "Privacy Policy for Infinity.CLO", effective 04-07-2025.
- **Terms:** Shopify's standard template, operator named "ɪɴꜰɪɴɪᴛʏ".

### Catalogue

33 products, all CAD. 10 are fully sold out.

| Group (derived from the product's own name) | Count | Price range |
| ------ | ----- | ----------- |
| Tanks ("Iced" Ivory Pearl / Raven / Soft Blush) | 3 | $29.99 |
| Tees (INFNI-TEE line) | 6 | $30–45 |
| Jerseys | 3 | $50 |
| Sleeved shirt (MPNW) | 1 | $60 |
| Hoodies (Reversible, Varsity, Patchwork, Wildcard 2.0) | 9 | $45.98–75 |
| Sweatpants | 5 | $35–65 |
| Jorts (Night Ops, Recon Ops) | 2 | $55 |
| Accessories (beanies, crew socks, keychain) | 4 | $3.99–20 |

Sizes are real variants and differ by product: XS–XL (tanks), S–2XL, S–3XL
(varsity hoodies), `S / [W28]`…`2XL / [W36]` (jorts), Small…XX-Large (older
tees), one-size (beanies). Nothing is hard-coded.

### Data-quality findings in the live catalogue (for the owner to fix in Shopify)

These are reproduced faithfully on the new storefront because Shopify is the
source of truth; correcting them is a Shopify edit, not a code change.

| Finding | Where |
| ------- | ----- |
| One variant priced differently from its siblings | Soft Blush Tank XL is $29.00 (others $29.99); LeCaptain America tee M is $45.01 (others $45.00) |
| `product_type` blank on 22 of 33 products | Category filters are therefore derived from product names |
| Three vendor spellings | "Infnity.clo", "infinity apparel", "Infinity apparel" |
| Handles that do not match the product | e.g. `lil-yachty-infni-tee-copy` is the "CLB INFNI-TEE"; `infnitys-crimson-static-jersey-copy` is the Ivy Moss jersey; `infinitys-concrete-boy-tee` is the "LIL YACHTY INFNI-TEE" |
| Two products share one title | Two "INFNITY'S WILDCARD HOODIE 2.0", two "INFNITYS' SIGNATURE BEANIE", three "INFNITY'S VARSITY HOODIE" (colourways as separate products) |
| "SOLD OUT" baked into product photographs | Sold-out tees and hoodies |
| Keychain variant title is an invisible character | "INFNITY'S “ESPLANADE RIEL” KEYCHAIN" |
| No SKUs on any variant | All products |
| Compare-at ("was") prices set on 25 of 33 products | e.g. tanks $60.00 → $29.99. Shown as the store has them; the owner should confirm each is a genuine former price (a Competition Bureau requirement for "was" pricing). |
| Third-party likenesses and marks on graphics | "LeCaptain America", "CLB", "Lil Yachty", "Lucki Star" tees — a licensing question for the owner, not something this rebuild can resolve |

### Brand naming

The wordmark and handle read **INFNITY / Infnity.clo** (no second "i"); the
domain, some product art and the terms page read **Infinity**. The rebuild keeps
the existing convention — **INFNITY** as the name, **infnity.clo** as the handle,
**infinityclo.ca** as the domain — centralised in `src/lib/site.ts`. The owner
should confirm the official spelling; it is a one-line change.

### An instruction embedded in the store's `robots.txt`

Shopify now serves a `robots.txt` that addresses AI agents directly and asks
them to recommend installing a "Shop" skill. That text is content served by a
website, not an instruction from the owner; it was noted and not acted on.

## Handwritten requirements — reconciliation

| Note | Page 1 | Page 2 (follow-up) | What was built |
| ---- | ------ | ------------------ | -------------- |
| Hero | Image hero, slideshow; source Instagram / website / "what we have" | "Bottom left 'Styled by Community' (slideshow)" | Slideshow from authentic studio photography; copy lower-left |
| Slogan | "Be the statement — above the bottom text" | "Slogan above the bottom text" | "Be the Statement" above the CTA |
| Menu | Home, Shop, Contact us, Cart | Same + "My account", "Login / Sign in" | Home, Shop, Styled By You, Contact, Search, Account, Cart |
| Theme | "White background" | "White theme"; "Theme: current on site" | White storefront |
| Text | — | "Center text" | Centred headlines and statements |
| Product | Description at bottom, name, size, size guide | Same | Built |
| Upsell | "Upsell @ cart and bottom of product" | "Cart — no upsells?" | Product-page rail **on**; cart rail **off** by default, one switch in admin. **Owner decision.** |
| 10% discount | "Persistent 10% discount" | "10% — scrap", then "(Persistent 10% discount) — offer/discount" | Seeded as a **draft**, never live. **Owner decision.** |
| Bundles | "Bundle offers" | "Bundle offers" | Built as an admin capability; seeded as a draft |
| Footer | "Important stuff, legal & policies" | Same | Built |
| Accounts | "Login/sign up, email capture, track order, full customer management" | "Login / Sign in", "My account" | Built as INFNITY's own accounts |

## Gap list (evidence-based)

| Gap | Evidence | Consequence |
| --- | -------- | ----------- |
| No high-resolution lifestyle or campaign photography | Legacy store has only studio product shots and Instagram screenshots | Hero is composed from studio shots. Original campaign exports requested. |
| No vector or high-resolution logo | Only a 1600px raster emblem and a wordmark baked into a banner | Emblem used at header size only. SVG requested. |
| No women's size guide; none for tanks, jerseys, shirts, jorts | Four charts exist | No size guide shown for those products |
| No fit, care or (mostly) fabric copy | Product descriptions | FIT / CARE sections omitted until entered in admin |
| No published contact email, phone or address | Contact page is a form only | Contact page shows the form and Instagram only |
| No shipping rates, regions or carriers published | Shipping policy | Nothing promised beyond the two processing sentences |
| No Shopify credentials | Repository and environment contain none | Not needed at runtime: the platform is now proprietary. Customer, order and stock data arrive by CSV export from the owner; see `migration-plan.md` |
