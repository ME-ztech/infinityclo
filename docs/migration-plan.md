# Migration and Reconciliation Plan — Shopify → INFNITY

Shopify is treated as a legacy system and a data source. Nothing in this plan
writes to Shopify, deletes anything in Shopify, or moves customer traffic
without the owner's explicit go-ahead.

## Status

| Step | Tooling | State |
| --- | --- | --- |
| Catalogue (products, variants, options, photographs) | `npm run import:catalog` → `npm run db:seed` | **Done** in development: 33 products, 156 variants, 90 images |
| Stock quantities | `npm run db:inventory -- <csv>` | Tool built and tested. **Needs the owner's inventory export.** |
| Customers | `npm run migrate:customers -- <csv>` | Tool built and tested on synthetic data. **Needs the owner's export.** |
| Historical orders | `npm run migrate:orders -- <csv>` | Tool built and tested on synthetic data. **Needs the owner's export.** |
| Reconciliation | `npm run migrate:reconcile`, `npm run db:status` | Built |
| Cutover | DNS | Not started. Owner approval required. |

The customer and order importers are written against the column layout of
Shopify's standard CSV exports and are covered by tests using synthetic rows.
They have **not** been run against this store's real exports, because those
contain personal data and must come from the owner. Expect a short adjustment
pass on the first real dry run.

## What migrates, and how

| Data | Source | Lands in | Method |
| --- | --- | --- | --- |
| Products, descriptions, prices, compare-at prices | Public product feed (already captured in `src/data/catalog/products.json`) | `products`, `product_variants`, `product_options` | `db:seed`, idempotent on legacy id |
| Product photographs | Shopify CDN (already downloaded to `public/products/`) | `product_media` | `db:seed` |
| URL slugs | Product handles | `products.handle` | Preserved exactly, so `/products/<handle>` is unchanged |
| Variant ids | Shopify variant ids | `product_variants.id` | Kept as-is, so carts saved before cutover still resolve |
| Stock quantities | Shopify admin → Products → Inventory → Export | `inventory_levels`, `inventory_movements` | `db:inventory`, matched by variant id or SKU |
| Customers, default address, tags, notes | Shopify admin → Customers → Export | `customers`, `customer_addresses` | `migrate:customers` |
| Marketing consent | "Accepts Email Marketing" column | `customers.marketing_consent`, source `shopify-import` | `migrate:customers` |
| Order history | Shopify admin → Orders → Export | `orders`, `order_items`, `order_events` with `source = shopify_import` | `migrate:orders` |
| Policies (shipping, returns, privacy, terms) | Legacy store pages | Storefront pages | Carried over, flagged for owner/legal review |
| Size charts, community wall, brand marks | Legacy store pages | `public/` | Imported |
| Discount codes | Shopify admin → Discounts | Offer drafts in `/admin → Promotions` | **Manual.** Re-create the ones still wanted. Shopify does not export them in a reusable form, and each should be a deliberate decision. |
| Newsletter subscribers who are not customers | Shopify email / Mailchimp / other | Subscriber records | **Manual CSV**, only for contacts with provable consent |

## What cannot migrate

| Item | Why | What happens instead |
| --- | --- | --- |
| **Passwords** | Shopify never exports them, in any form | Customers are imported with no password. They set one by registering or using "Forgot password"; both require clicking a link sent to the address, which is what proves ownership. Their order history is waiting for them. |
| **Saved cards and payment tokens** | They belong to Shopify Payments and are not portable | Customers enter payment details again at their next checkout, into Stripe |
| **Payment records** (transaction ids, authorisations) | Not usable outside the processor that created them | Imported orders are read-only records. They **cannot be refunded from INFNITY's admin**; refunds on them are made in Shopify for as long as it stays open. The admin refuses and says why. |
| **Shopify customer account sessions** | Different system | Everyone signs in fresh |
| **Abandoned checkouts** | Tied to Shopify checkout | Not carried over |
| **Analytics history, sessions, conversion** | Shopify Analytics is not exported | Export summary reports from Shopify before closing it and keep the files |
| **Gift cards / store credit** | Not modelled here | If any are outstanding, honour them manually and note it — check before cutover |
| **App data** (reviews, loyalty points) | Lives in third-party apps | Export from each app if it matters |
| **Tax and payout history** | Accounting records, not operational data | Download from Shopify and Shopify Payments for the accountant; retain per CRA rules |

## Sequence

### Phase A — Rehearsal (staging, no customer impact)

1. Create the staging database and run `npm run db:migrate`.
2. `npm run db:seed` — catalogue.
3. Export from Shopify: inventory, customers, orders (all time).
4. Dry runs — nothing is written:

```bash
npm run migrate:customers -- ./exports/customers.csv --dry-run
```

```bash
npm run migrate:orders -- ./exports/orders.csv --dry-run
```

5. Read every `rejected` line. Fix the importer or the data until each
   rejection is understood.
6. Real runs on staging, then `npm run db:inventory -- ./exports/inventory.csv`.
7. `npm run migrate:reconcile` and complete the table below.
8. Owner UAT on staging with Stripe **test** keys.

### Phase B — Freeze and final sync (production day)

1. Announce a short maintenance window. In Shopify, set a storefront password so
   no new orders arrive mid-migration.
2. Take the final exports.
3. Production database: migrate, seed, import inventory, customers, orders.
   Every importer is idempotent, so a run that stops halfway is simply re-run.
4. Reconcile again. Do not proceed on an unexplained difference.
5. Enter shipping rates, tax rates and any discounts in `/admin`.
6. Place one real order with a real card for a small amount; refund it.

### Phase C — Cutover (owner approval required)

1. Point `infinityclo.ca` at the new platform (DNS).
2. Leave Shopify open, password-protected, on its `myshopify.com` address.
3. Email customers: new site, how to set a password, order history is there.
   Service message to existing customers; no marketing content.

### Phase D — Parallel period (suggested 60–90 days)

Shopify stays open, read-only, for refunds on old orders, chargebacks, tax
documents and as the rollback target.

### Phase E — Retirement (owner approval required)

Only when: no open orders, refunds or disputes remain in Shopify; final payouts
have settled; tax and payout reports are downloaded and archived; outstanding
gift cards are resolved. Then cancel the Shopify plan.

## Reconciliation

Fill this in from `npm run migrate:reconcile` and Shopify's own screens. Every
difference must be explained by an importer's `rejected` list.

| Figure | Shopify | INFNITY | Difference explained by |
| --- | --- | --- | --- |
| Products (active + draft) | Products list count | `products` | |
| Variants | Inventory export rows | `variants` | |
| Variants with a counted quantity | — | `variants − variantsWithoutCountedStock` | **Must equal variants before launch** |
| Total units on hand | Sum of export "On hand" | `SELECT sum(on_hand) FROM inventory_levels` | |
| Customers | Customers list count | `customers` | Rows without an email are rejected |
| Customers accepting marketing | Segment "Email subscribed" | `customersWithMarketingConsent` | |
| Orders | Orders list count (all time) | `importedOrders` | |
| Gross sales | Sum of "Total" in the export | `importedOrdersTotalCents` | Must match to the cent |
| Orders with no matching customer | — | `importedOrdersWithoutCustomer` | Guest checkouts |

Spot checks, by hand, on five orders chosen by the owner: line items, totals,
discount, tax, shipping address, status. And on five customers: name, address,
consent, order history.

Current development database (catalogue only):

| Figure | Value |
| --- | --- |
| Products | 33 |
| Variants | 156 |
| Variants sold out at import | 64 |
| Variants available but **not yet counted** | 92 |
| Customers, orders | 0 — not imported |

## Validation built into the tools

- **Idempotent:** keyed on legacy id / order name; safe to re-run.
- **Dry run:** validates and reports without writing.
- **Exact money:** amounts are parsed to integer cents as text, never through
  floating point; a reconciliation of gross sales should match to the cent.
- **Rejections are listed, not dropped:** each with its row number and reason.
- **No side effects:** imported orders never touch stock; imported customers
  receive no email.
- **Refuses to guess:** an order with an unrecognised status is rejected rather
  than mapped to something plausible.

## Rollback

| Stage | How to undo |
| --- | --- |
| Before cutover | Nothing to undo. Staging and production databases can be dropped and rebuilt from the exports at any time. |
| After cutover, during the parallel period | Point DNS back at Shopify and remove its storefront password. Orders taken on the new platform stay in INFNITY's database and are fulfilled from the admin; they are not written back to Shopify. Inventory in Shopify must be adjusted by hand for those orders. |
| After Shopify is cancelled | No rollback to Shopify. Recovery is from database backups (`deployment-and-rollback.md`). |

The decision to roll back should be made within the first days, while the
number of orders to reconcile by hand is small.

## Privacy during migration

- Exports contain personal data. Keep them off shared drives and out of the
  repository (`exports/` is git-ignored); delete them after the migration is
  reconciled.
- Never paste export contents into chat or tickets.
- Marketing consent is carried over only where Shopify recorded it, with its
  origin (`shopify-import`) stored. Customers can withdraw it in their account
  or by any unsubscribe link.
