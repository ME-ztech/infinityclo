# Data Model and Commerce Domain

The schema is defined in `src/server/db/schema.ts` and applied by generated SQL
migrations in `drizzle/`. This document explains the model; the schema file is
the authority on columns.

## Conventions

| Convention | Rule |
| --- | --- |
| Money | Integer minor units (cents) + ISO currency. No floating-point money exists anywhere. |
| Rates | Basis points (500 = 5%). |
| Ids | Application-generated text with a type prefix: `prd_`, `var_`, `ord_`, `cus_`, `chk_`… Migrated variants keep their legacy id so old carts still resolve. |
| Time | `timestamptz`. |
| Snapshots | An order copies what it needs (title, price, address) so later edits never rewrite history. |
| Legacy ids | `legacy_shopify_id` columns exist only to make migration idempotent. Nothing reads them at runtime. |
| Changes | Edit `schema.ts`, run `npm run db:generate`, review the SQL, commit it. Never alter a database by hand. |

## Entity map

```
products ──< product_options
   │  └────< product_media
   └──< product_variants ──1 inventory_levels
            │      └──────< inventory_movements     (append-only ledger)
            └─────────────< inventory_reservations  (per checkout)

collections >──< products            (collection_products)

customers ──< customer_addresses
   │  ├─────< customer_sessions      (hashed tokens)
   │  ├─────< customer_tokens        (verify email / reset password)
   │  └─────1 carts ──< cart_items
   │
   ├──< checkouts                    (priced, stock-reserved attempt to buy)
   └──< orders ──< order_items
            ├───< payments           (the charge, each refund)
            ├───< fulfillments       (shipments, tracking, delivery)
            └───< order_events       (timeline)

discounts ──< discount_redemptions >── orders
shipping_rates      tax_rates        (configuration)
webhook_events                       (idempotency receipts)
documents                            (content, drafts, consent, tickets, staff, audit)
```

## Catalogue

| Table | Purpose | Notes |
| --- | --- | --- |
| `products` | A sellable design | `handle` is the URL slug, unique, preserved from the legacy store. `status` is draft / active / archived. `publish_at` schedules a launch. `preorder` allows selling beyond stock. `fit`, `fabric`, `care`, `size_chart` are nullable: null means "not confirmed", and the section is omitted on the page. |
| `product_options` | Axes such as Size, Colour | Ordered values. |
| `product_variants` | One buyable combination | `price_cents`, optional `compare_at_cents`, optional unique `sku`, `option_values` JSON. |
| `product_media` | Photographs | Position, alt text, dimensions, `source_url` for provenance. |
| `collections`, `collection_products` | Curated groupings | Ordered membership. |

**Visibility** is one rule, in one place (`loadProducts`): a product is public
when `status = 'active'` and `publish_at` is null or in the past. A scheduled
launch therefore goes live by the clock — no job, no deployment.

**Lifecycle** maps onto those columns:

| Stage | status | publish_at | Stock |
| --- | --- | --- | --- |
| Draft | draft | — | — |
| Scheduled | active | future | any |
| Coming soon (teased) | draft, with a Drop in "coming soon" | — | — |
| Pre-order | active, `preorder = true` | past/null | may be 0 |
| Published | active | past/null | > 0 |
| Sold out | active | past/null | 0 available |
| Archived | archived | — | — |

## Inventory

`inventory_levels` holds two counters per variant:

- `on_hand` — physically in stock;
- `reserved` — promised to an open checkout or to a paid, unshipped order.

**Available = on_hand − reserved.** `tracked = false` means the variant is not
limited by stock.

Every change is one conditional `UPDATE` whose guard is in the `WHERE` clause,
so the database — not application code — decides who gets the last unit:

| Event | Effect | Ledger entry |
| --- | --- | --- |
| Checkout opens | `reserved += n` (only if available ≥ n) | reservation row, `active` |
| Checkout expires / is abandoned / payment never arrives | `reserved −= n` | reservation → `released` |
| Payment confirmed | no counter change | reservation → `committed` |
| Order ships | `on_hand −= n`, `reserved −= n` | movement `sale` |
| Paid order cancelled before shipping | `reserved −= n` | — |
| Return restocked | `on_hand += n` | movement `restock` |
| Staff recount | `on_hand = x` **only if it still equals what they saw** | movement with reason |

`inventory_movements` is append-only, so stock is always explainable: every
unit that ever entered or left `on_hand` has a row saying why and by whom.

Edge case handled explicitly: a payment that lands after its hold expired is
still honoured (the customer paid), the stock is re-committed, and if the shelf
can no longer cover it the order gets an `oversold` event for staff to see
before fulfilling.

## Customers

| Table | Purpose |
| --- | --- |
| `customers` | Email (stored lower-cased, unique), scrypt `password_hash` (null for migrated customers who have not set one), verification time, **explicit** marketing consent with time and source, staff note and tags. |
| `customer_addresses` | Up to ten per customer, one default. |
| `customer_sessions` | A session is a random token in an httpOnly cookie; only its SHA-256 is stored. Expiry 30 days; revocable; all revoked on password change. |
| `customer_tokens` | Single-use, expiring, hashed tokens for email verification (48 h) and password reset (60 min). |

Rules: an unverified address cannot sign in; registration and reset answer
identically whether or not the address exists; guest orders attach to an account
only after the address is verified; erasure deletes the account and anonymises
its orders (kept for tax records, stripped of identity and address).

## Checkout

`checkouts` is a priced, stock-reserved attempt to buy:

- `lines` — a JSON snapshot of each line (variant, title, unit price, quantity,
  allocated discount, image);
- contact email, shipping address, chosen shipping rate, applied discount;
- frozen totals: `subtotal`, `discount`, `shipping`, `tax`, `total`, plus the
  individual `tax_lines`;
- `payment_ref` — the Stripe PaymentIntent, unique;
- `token_hash` — the bearer token in the customer's cookie, hashed;
- `expires_at` — 30 minutes; `recovery_consent` — whether a reminder may be sent.

Pricing is one pure function (`src/domain/pricing.ts`):

```
line subtotal  = unit price × quantity
line discount  = round_half_up(line subtotal × percent / 100)   if eligible
merchandise    = Σ line subtotal − Σ line discount
shipping       = rate price, or 0 at/above the free-shipping threshold
tax (per rate) = round_half_up((merchandise + shipping if taxable) × bps / 10000)
total          = merchandise + shipping + Σ tax
```

One discount applies per checkout: a valid code if entered, otherwise the
automatic discount that saves the most.

## Orders

| Table | Purpose |
| --- | --- |
| `orders` | The durable record. `number` is a sequence; `name` is `#1001`-style (or the legacy name for imports). `payment_status`: pending_payment / paid / partially_refunded / refunded. `fulfillment_status`: unfulfilled / partially_fulfilled / fulfilled. Cancellation is a timestamp and reason. Totals are copied from the checkout. `source` distinguishes native orders from imported history. `test` marks orders paid in a provider's test mode. |
| `order_items` | Snapshot of each line, with `fulfilled_quantity` and `refunded_quantity`. |
| `payments` | One row for the charge and one per refund. `(provider, provider_ref)` is unique — the idempotency key. |
| `fulfillments` | A shipment: which items, carrier, tracking number and URL, `shipped_at`, and `delivered_at` only when delivery was actually recorded. |
| `order_events` | The timeline: placed, fulfilled, refunded, cancelled, note, oversold, imported. |

Uniqueness constraints that make order creation safe: `orders.checkout_id`,
`orders.payment_ref`, `orders.number`, `payments (provider, provider_ref)`,
`webhook_events.id`.

State is derived, never set by hand:

```
payment_status      from refunded_cents vs total_cents
fulfillment_status  from Σ fulfilled_quantity vs Σ quantity
"delivered"         only if every shipment has delivered_at
```

## Discounts

Authoring and enforcement are separate on purpose.

- An **offer** (`src/domain/offers.ts`, stored as a document) is a draft the
  team edits. It is invisible to customers.
- Activating it (Owner only, after a recorded margin check) copies its
  definition into **`discounts`**, which is what checkout reads. Editing the
  draft afterwards cannot silently change what customers are charged.

`discounts` supports: percentage off; quantity bundles (percent off when N or
more eligible units are in the cart); code or automatic; everyone or first-order
only; eligibility by all / products / category groups, optionally excluding sale
items; date window; total usage limit; once per customer.
`discount_redemptions` records each use and enforces once-per-customer.

Not modelled: fixed-price bundles ("any two for $80"), stacking of several
discounts, gift cards, free-shipping codes.

## Configuration tables

| Table | Purpose | Starts |
| --- | --- | --- |
| `shipping_rates` | Flat rates by country / province, optional free-over threshold, optional delivery estimate | Empty — checkout is closed until one exists |
| `tax_rates` | Rates by country / province in basis points; whether shipping is taxable | Empty — no tax is charged until the owner enters confirmed rates |

## Documents

`documents (collection, id, data jsonb)` holds records that are not relational
commerce data, behind the `DocumentStore` interface (`src/server/store.ts`):

| Collection | Contents |
| --- | --- |
| `content` | Homepage: hero slides, statement, section order, featured products, lookbook, upsell switches, social links |
| `offers` | Offer drafts and their status |
| `drops`, `waitlist` | Upcoming-product teasers and their waitlists |
| `subscribers` | Newsletter consent records (wording, time, source) |
| `community` | Submitted photos awaiting or past moderation |
| `tickets` | Contact and help requests |
| `staff` | Staff accounts and roles |
| `audit` | Every admin action: who, what, outcome |

Keeping them in the same database means one backup covers the whole business.

## Indexes worth knowing

`products(handle)` unique; `products(status, publish_at)`;
`product_variants(product_id, position)`; `inventory_reservations(status, expires_at)`;
`checkouts(token_hash)`, `checkouts(payment_ref)` unique;
`orders(customer_id, placed_at)`, `orders(email)`, `orders(placed_at)`;
`customer_sessions(token_hash)` unique.

## What the model does not yet cover

| Gap | Consequence |
| --- | --- |
| Multiple stock locations | One stock figure per variant |
| Server-side carts for signed-in customers (`carts` exists, unused) | A cart lives in the browser it was built in |
| Carrier-calculated shipping | Flat rates only |
| Tax beyond rate tables | See `architecture-decision.md` |
| Product media upload | Images are added by path or URL |
| Per-variant weight-based shipping | Not used in rate selection |
