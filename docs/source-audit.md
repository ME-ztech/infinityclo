# Source Audit — INFNITY / infinityclo.ca rebuild

_Audited 2026-11-16 from this repository's build environment. Network access to
`infinityclo.ca`, `cdn.shopify.com`, `unashamed.site` and `shopify.dev` was
enabled for this session (the previous session was blocked, see
`LEGACY_BRAND_AUDIT.md`). Only public, unauthenticated endpoints were read. No
purchase, sign-in, form submission or write of any kind was made against the
live store._

## Source-of-truth table

| Source | Verified findings | Assets accessible | Rights / ownership status | Reused in rebuild | Still unknown |
| --- | --- | --- | --- | --- | --- |
| **Repository** `ME-ztech/infinityclo` | Next.js 16.3 / React 19.2 / TS strict / Tailwind 4 storefront ("STOREFRONT 1.1"). Clean domain model, repository seam, cart that stores identities only, honest null-for-unknown rules, Vitest + Playwright. No database, no auth, no payment, no admin. Catalogue snapshot empty (import was blocked). | All source | Owner's repo | **Kept and extended** — domain model, repositories, cart, design tokens, tests | — |
| **Legacy Shopify store** `infinityclo.ca` | Shopify store `apparelinifinty85.myshopify.com`, shop id `60570697948`, country **CA**, currency **CAD**, locale `en`. Custom theme "EYEZY ULTIMATE" (site by Eyecey). **Classic** customer accounts (`/account/login` → 200). | Public JSON + HTML | Owner's store | Catalogue, policies, size charts, brand mark, community wall | Admin data (orders, customers, inventory counts, discounts) — requires owner-authorised API access |
| `/products.json` | **33 public products**, 155 variants. Collection `all` reports **36** products → 3 products are not published to the Online Store (draft/unlisted/other channel). Prices CAD. Per-variant `available` boolean only (no counts). No SKUs set. | 33 products, ~95 product photos on Shopify CDN | Owner's catalogue and photography | Imported into `src/data/catalog/products.json`; photos referenced from owner's Shopify CDN | The 3 unpublished products; inventory counts; costs/margins |
| Shopify Markets | **A US market with USD presentment prices is enabled.** Unpinned requests from a US IP received converted prices (e.g. $22.00 instead of $29.99). The importer now pins `localization=CA` and refuses to import unless `/cart.js` confirms CAD. The Storefront adapter passes `@inContext(country: CA)` by default. | — | — | CAD as default market | Which markets/currencies the owner actually wants to sell in |
| `/collections.json` | Only one public collection: `all` ("All Products"). No category collections exist. | — | — | Categories derived from product names (`src/domain/taxonomy.ts`) | Whether owner wants real Shopify collections created |
| `/pages/*` | `contact` (Shopify contact form: name, phone, email, message), `customer-gallery` "THE TROOP IN INFNITY" (34 images; "POST AND TAG US @INFNITY.CLO TO BE HERE"), `jointhetroop` (empty title page), `bundle-of-2` (two size-chart images only, no offer copy), `bottom-size-chart` | Size-chart artwork (2 charts), 34 community images | Size charts: brand-authored. Community: customer Instagram-post screenshots published by the owner on the legacy site | Size charts transcribed into structured data; community wall imported into the moderated gallery | Documented consent from each community subject |
| `/policies/*` | Refund (10-day returns, unworn with tags, start via Instagram DM, no returns on sale items), Shipping (2–3 business days processing + 3–5 business days shipping), Privacy (effective 04-07-2025), Terms (Shopify template), Contact information (trade name **Infnity.clo**, phone, email) | Text | Merchant's own published policies | Shown verbatim on policy pages, flagged for owner/legal review | Whether policies are current; legal entity name |
| Homepage | White page, nav `HOME · CONTACT US · SIGN UP · STYLED BY YOU`, centred text logo `INFNITY.CLO`, `CART (0)`, two red buttons `" ENTER THE VAULT "` → `/collections/all`, `" STYLED BY YOU "` → customer gallery. Page title **"Be the Statement !!!"**. No hero photography. Fonts: ITC Avant Garde Gothic (Bold Oblique / Pro Md) self-hosted on Shopify CDN. | `Untitled_Artwork_5` (gold swoosh mark, 2048² PNG, used as favicon), `Untitled_Artwork_2` (wide "infinity" script-oval wordmark over an illustrated landscape) | Brand mark: owner's. Landscape banner: provenance unknown (appears AI-illustrated) | Swoosh mark used as the header/brand mark | Vector logo files; ITC Avant Garde webfont licence |
| Installed Shopify apps (from theme) | **AVADA free-gift / volume-discount**: two ACTIVE gift-with-purchase campaigns `FREESKII.PT1` / `FREESKII PT.2` — spend **$100** → free **INFNITY Crew Socks** (backed by a Shopify discount code). EcomSend (pop-up/marketing), Chizy AI chatbot. Payments shown: Amex, Apple Pay, Bancontact, Google Pay, iDEAL, Mastercard, PayPal, Satispay, Shop Pay, Visa. | — | Third-party apps; the AVADA script embeds **its own** public storefront token, which this project does **not** use | Gift-with-purchase modelled as a draft promotion for owner decision (app JS does not run on a headless storefront) | Whether FREESKII should continue; actual enabled payment methods at checkout |
| **Instagram** `@infnity.clo` (screenshot 05) | Display name "!nfnïty®", 132 posts, 1,312 followers, "Community · Based in 🇨🇦", link www.infinityclo.ca, Threads `infnity.clo`, Facebook `Infinityapparelclo`, Slynda. Avatar = the same swoosh mark (white on black). Grid: tank-top campaign, studio shoot, "3 DAYS LEFT…" drop teaser. | Public profile page redirects to login (302) — **not scraped** | Owner's account (link-in-bio matches domain) | Handle + social links in footer; editorial direction | Original campaign photo/video exports |
| **Unashamed** `unashamed.site` (screenshots 03, 04) | Design reference only. Full-bleed photo hero with rotating stacked statements bottom-left, VIEW CTA, PAUSE control; centred circular monogram; white editorial sections ("SHOP …", LOOKBOOK, "JOIN THE FAMILY" early access); dark footer; PDP with square size/colour buttons (sold-out struck through), Fit/Fabric/Care/Shipping & Returns accordions, `ADD TO CART — $51.00`, `CONTINUE SHOPPING →`. Fonts: Abril Fatface, Archivo, Bayon. | Viewed only | Third-party brand | **Layout patterns only.** No photos, text, logo, religious copy, fonts files or code copied | — |
| Handwritten notes p.1 (screenshot 04 / ref 01) | Hero = image slideshow sourced from Instagram / website / "what we have"; audit Unashamed; slogan "Be the statement" above the bottom text; top menu Home / Shop / Contact us / Cart; "View: Shop All" → catalogue; product description at bottom, name + size; size guide (Temu-style); "You may also like" (upsell at cart and bottom of product); footer legal/policies; Login/sign up; email capture; track order; full customer management; white background theme; **Note: persistent 10% discount; offer/discount; bundle offers** | — | Owner's requirements | Implemented | — |
| Handwritten notes p.2 (ref 02, follow-up) | Hero bottom-left **"Styled by Community" (slideshow)**; slogan above the bottom text; persistent top menu; size guide; "You may also like"; footer legal & policy; **"10% — scrap"**; centre text ✓; Login / Sign in; My Account; "Theme: current on site"; white theme; "Persistent 10% discount — offer/discount"; **"cart: no upsells?"**; bundle offers | — | Owner's requirements | Implemented; conflicts surfaced as admin switches (below) | Owner decision on 10% and cart upsell |

## Conflicts in the owner's notes — resolved as switches, not guesses

| Topic | Page 1 | Page 2 (follow-up) | Master brief | Rebuild behaviour |
| --- | --- | --- | --- | --- |
| 10% offer | "Persistent 10% discount" | "10% — scrap" and "Persistent 10% discount" both appear | Build it, keep it DRAFT until owner approval + margin check | 10% offer exists as a **draft** promotion; never displayed until approved and synced to Shopify |
| Upsell in cart | "upsell @ cart and bottom of product" | "cart: no upsells?" | Subtle, not forced | PDP "You may also like" on; **cart upsell OFF by default**, one switch in Admin → Settings |
| Theme | white background | "Theme: current on site" + white theme | White editorial | White surfaces, black type, the legacy store's bold-oblique uppercase voice and red signal colour retained |

## Brand naming — evidence

| Where | Spelling |
| --- | --- |
| Shopify trade name (contact policy), page titles, footer © | **Infnity.clo** |
| Product titles | **INFNITY'S …** (also "INFINITY'S", "INFNITYS'", "infinity apparel" vendor) |
| Instagram handle / display name | `infnity.clo` / **!nfnïty®** |
| Script wordmark on garments and banner | "infinity" |
| Domain / Shopify handle | infinityclo.ca / apparel**inifinty**85 |
| Master brief | INFINITY.CLO / INFINITY® ("verify") |

The evidence favours **INFNITY** (deliberately missing `i`) as the brand name and
**Infnity.clo** as the trade name; this is what the repository already
standardised on in `src/lib/site.ts`. The display name is now an owner-editable
setting (Admin → Settings) so it can be changed without a deployment. No logo was
invented: the header uses the owner's own swoosh mark from the live store.

## Catalogue data-quality findings (for the owner — not silently "fixed")

| Product | Finding |
| --- | --- |
| INFNI-TEE'S LECAPTAIN AMERICA | Size **M priced $45.01**, other sizes $45.00 — likely typo |
| INFNITY'S ICED SOFT BLUSH TANK | **XL $29.00**, others $29.99; compare-at $60 only on L |
| GRAPHITE / OBSIDIAN BLANK SWEATPANTS | Description describes a hoodie ("Kangaroo pockets", "Embroidery on the top of the hood") |
| TS&MM INFNI-TEE'S, LIL YACHTY INFNI-TEE | Description is "Concrete Boy Tee" copy; handles don't match titles |
| LUCKI STAR / CLB INFNI-TEE | Compare-at equals price ($45/$45) → not a real sale; storefront hides compare-at unless it is higher |
| WILDCARD HOODIE 2.0 | Two separate products with the same title |
| VARSITY HOODIE | Three separate products with the same title (Ashen Grey / Alabaster / Obsidian) → linked as colour siblings on the PDP |
| ESPLANADE RIEL KEYCHAIN | Option value is an invisible character (`U+200E`) |
| All products | No SKUs, no barcodes, `product_type` mostly blank, no collections beyond `all` |
| Product names | "Lil Yachty", "Lucki", "Captain America" reference third-party names/marks — **owner/legal review recommended** |
| Shipping copy | PDPs say "ships within 3–5 business days after purchase"; shipping policy says 2–3 days processing + 3–5 days shipping |
| Privacy policy | Contact email spelled three different ways (`apparelinifinty85@…`, `ApparelInfinity85@…`, `AppareIinfinity85@…` with a capital I) |

## What could not be audited (requires owner credentials)

Shopify Admin data (orders, customers, inventory counts by location, discounts,
markets, shipping zones and rates, tax settings, payment settings, staff), the 3
unpublished products, Instagram originals, and the brand's logo source files.
Exact requests are in `docs/launch-checklist.md`.
