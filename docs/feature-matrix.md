# Feature Matrix

Against the master brief, on the proprietary architecture. "Tested" names the
kind of evidence (`test-evidence.md`). Source of truth is INFNITY's database
unless stated.

**Implemented:** ✅ yes · ◐ partly · ✗ no. **Tested:** U unit/integration ·
B browser · — none.

## Storefront

| Feature | Impl. | Tested | Limitations |
| ------- | ----- | ------ | ----------- |
| White editorial theme, centred headlines, emblem header | ✅ | B | Vector logo and campaign photography still to come from the owner |
| Sticky header: Home, Shop, Styled By You, Contact, Search, Account, Cart count | ✅ | B | |
| Mobile slide-out menu | ✅ | B | |
| Hero slideshow, pause/play, prev/next, reduced-motion, admin-editable | ✅ | B | Composed from studio shots; no lifestyle imagery exists yet |
| "Be the Statement" statement block | ✅ | B | |
| Featured / latest drop with live price and stock | ✅ | B | |
| Enter the Vault CTA | ✅ | B | |
| Lookbook | ✅ | — | Studio photography only |
| Styled By You community gallery | ✅ | B | Legacy wall is Instagram screenshots; consent to be confirmed by owner |
| Coming-soon teaser with waitlist | ✅ | U | Hidden until a drop exists; nothing invented |
| Newsletter capture with explicit consent | ✅ | U B | No welcome email is sent |
| Footer: shop, brand, account, policies, social | ✅ | B | Instagram only until other URLs are confirmed |
| Homepage section order editable without code | ✅ | B | |
| Shop with category, availability, size, colour, price filters; sorts | ✅ | B | "Best selling" sort not offered (no data yet) |
| Search | ✅ | B | In-process scoring |
| Legacy URL redirects; product slugs preserved | ✅ | B | |
| Product page: gallery, zoom, swipe | ✅ | B | 9 products have one photo |
| Variant buttons with clear selected / sold-out states | ✅ | B | |
| Per-variant availability; sold-out cannot be bought | ✅ | U B | 92 variants uncounted until stock import |
| `ADD TO CART — $XX.XX`, quantity, continue shopping | ✅ | B | |
| Fit / Fabric / Care / Shipping & Returns accordions | ✅ | B | Fit and Care empty until entered; never invented |
| Size guide from the brand's own charts | ◐ | B | Four charts exist; none for tanks, jerseys, shirts, jorts; no women's guide supplied |
| You May Also Like | ✅ | B | |
| Product structured data, canonical, Open Graph | ✅ | B | |
| Cart drawer and page; update, remove, persist | ✅ | B | Guest cart is per-browser |
| Cart upsell | ✅ | — | Off by default (owner's note); switch in admin |
| Brand story, contact, FAQ, size guide pages | ✅ | B | Story limited to verified brand language |
| Policies | ✅ | B | Carried over; flagged for owner/legal review; privacy must be updated for new processors |

## Checkout and payments

| Feature | Impl. | Tested | Limitations |
| ------- | ----- | ------ | ----------- |
| On-site checkout, guest or signed in | ✅ | B | |
| Server-computed subtotal, discount, shipping, tax, total | ✅ | U B | |
| Stock reserved during checkout, released on expiry | ✅ | U B | |
| Flat shipping rates, free-over threshold | ✅ | U | No carrier rates |
| Tax by rate table (multi-rate) | ✅ | U | Canada-suitable; not US/EU |
| Card payment via Stripe Payment Element | ◐ | U (signature) | **Never run against Stripe** |
| Apple Pay / Google Pay | ◐ | — | Available through Stripe once enabled and the domain is verified; not promised |
| Order created only from verified webhook; idempotent | ✅ | U B | |
| Order confirmation page and email | ✅ | B | Needs an email provider in production |
| 10% offer, configurable, draft until approved | ✅ | U B | Seeded as a draft; not live |
| Bundle offers (N or more, percent off) | ✅ | U | No fixed-price bundles |
| Discount codes: window, limits, once per customer, first order | ✅ | U B | One discount per order |
| Abandoned-checkout reminder with consent, once | ✅ | — | Needs email + cron |
| Post-purchase upsell | ✗ | — | Planned |

## Customer accounts

| Feature | Impl. | Tested | Limitations |
| ------- | ----- | ------ | ----------- |
| Register, email verification, sign in, sign out | ✅ | U B | |
| Password reset, change password | ✅ | U | |
| Account overview with consent status | ✅ | B | |
| Order history and detail with tracking | ✅ | U B | |
| Delivery shown only on evidence | ✅ | U B | |
| Addresses | ✅ | U | |
| Profile and marketing preference | ✅ | U | |
| Help / return / exchange request | ✅ | — | Creates a ticket; nothing automatic |
| Wishlist | ✅ | U | Device-local |
| Customer isolation, session expiry | ✅ | U B | |
| Migrated customers claim their account by email | ✅ | U | |

## Admin

| Feature | Impl. | Tested | Limitations |
| ------- | ----- | ------ | ----------- |
| Sign-in, four roles, server-side permission checks, audit log | ✅ | U B | No two-factor yet |
| Overview: sales, paid orders, awaiting fulfilment, low stock | ✅ | B | Test orders excluded |
| Products: create, edit, duplicate, draft/publish/archive, variants, prices, SKU, SEO, PDP content | ✅ | U B | Photos by link, not upload; no scheduling field in the UI |
| Inventory: per variant, compare-and-set edits, reasons, ledger, low-stock threshold | ✅ | U B | One location |
| Orders: search, filter, export, detail, notes, fulfil with tracking, mark delivered | ✅ | B | |
| Refunds and cancellation | ✅ | U | Unverified against Stripe; no restock tick-box in the UI |
| Customers: search, profile, history, notes, tags, export | ✅ | — | |
| Promotions: drafts, margin check, owner-only activation, pause, end, usage | ✅ | U B | |
| Content CMS: hero, statement, sections, featured, lookbook, upsell, social | ✅ | B | |
| Drops: lifecycle, waitlist, export, preview link | ✅ | — | |
| Community moderation with consent record | ✅ | B | |
| Marketing: subscribers with consent, export | ✅ | — | No sending from here, by design |
| Inbox: contact and help tickets | ✅ | — | |
| Analytics: sales, AOV, top items, codes | ✅ | — | Sessions and conversion not instrumented, and say so |
| Settings: integration status, checkout readiness, shipping, tax, staff, audit | ✅ | B | |

## Platform

| Feature | Impl. | Tested | Limitations |
| ------- | ----- | ------ | ----------- |
| PostgreSQL schema with migrations | ✅ | U | Not yet run on a PostgreSQL server |
| Shopify-independent runtime | ✅ | U B | |
| Migration: catalogue, stock, customers, orders, reconciliation | ✅ | U | Not run on real exports |
| Separate dev / staging / production configuration | ✅ | B | To be provisioned |
| Webhook verification, idempotency | ✅ | U B | |
| Rate limiting | ✅ | U | Per instance |
| Backups and recovery | ◐ | — | Procedure documented; to be enabled and drilled |
| CI | ◐ | — | Workflow committed, not yet run |
| Monitoring | ✗ | — | Planned |
| Staging deployment | ✗ | — | Needs the owner's hosting account |
