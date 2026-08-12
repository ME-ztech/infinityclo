# Phase 2 — Commerce Backend

Phase 1 delivered the storefront and, deliberately, no transaction capability.
This describes what comes next and in what order. It is a plan, not a licence to
expand the backend without scope.

## Principle

Stay a **modular monolith**. One Next.js application, one database, clear module
boundaries. No microservices, no queue infrastructure, no service mesh. The
repository seam already established is the module boundary; Phase 2 fills in
implementations behind it.

## Slice 1 — Import the real catalog (blocking everything)

Nothing below matters until the storefront has real products.

1. Allow `infinityclo.ca` and `cdn.shopify.com` for the build environment.
2. Run `npm run import:legacy`.
3. Review the generated `ASSET_PROVENANCE.md` and the importer's warnings.
4. Fill in the product specifications the brand supplies (`BRAND_STORY_INPUTS_NEEDED.md`
   Q11–Q16). These are `null` and render as omitted sections until then.
5. Redeploy so `generateStaticParams` emits the product and collection routes.
6. The 21 skipped Playwright journeys begin running automatically.

**No code changes required.** The importer and the adapters already exist.

## Slice 2 — PostgreSQL behind the existing repositories

Move the catalog from JSON to a database without touching a component.

Schema, roughly:

```
products, product_variants, product_options, product_media, collections,
collection_products, size_guides, ugc_entries
```

Then implement `PostgresCatalogRepository` and `PostgresContentRepository`
against the existing interfaces and switch `src/data/index.ts`. The local
adapters stay as the fixture path for tests.

Suggested: Drizzle or Prisma; either is compatible with the seam. The JSON
snapshot becomes the seed.

**Definition of done:** `src/data/index.ts` is the only changed file outside
`src/data/adapters/`, and the full test suite passes unchanged.

## Slice 3 — Accounts

- Sessions and password hashing (Auth.js or a hand-rolled session table).
- `customers`, `addresses`, `sessions` tables.
- Implement `CustomerRepository`.
- Build the sign-in and registration UI. `/account` currently shows an honest
  "not open yet" surface with **no fake sign-in form** — that is what gets
  replaced.
- Merge the guest cart into the customer cart on sign-in.

## Slice 4 — Server-owned carts

- `carts`, `cart_lines` keyed by session or customer.
- Implement `CartRepository` server-side.
- The client contract does not change: it already sends identities only and
  receives a priced cart. Swapping the storage is invisible to the UI.

## Slice 5 — Inventory

- `inventory_levels` with real counts.
- `stock_reservations` with expiry, held for the life of a checkout session.
- Map counts to `InventoryDisplayState` **behind the repository**. Raw counts
  must not reach the client — the display-state model exists precisely so the
  storefront cannot imply scarcity it has not verified.

## Slice 6 — Checkout and payment

The flow is already documented in `src/domain/checkout.ts`:

```
Cart → CheckoutSession → InventoryReservation → Payment
     → VerifiedPaymentEvent → Order → Fulfilment
```

1. `POST /api/checkout/session` — server creates and **server prices** the
   session, reserves stock, and returns a redirect.
2. Redirect to Stripe Checkout or Payment Element. Card data never touches this
   application.
3. `POST /api/webhooks/stripe` — verify the signature, then create the order.
4. Release the reservation on expiry or failure.

**The one invariant:** an order is created only from a signature-verified
webhook. There must be no path from browser state to an order — no success page
that writes one, no client-supplied "paid" flag. The success page reads an order
the webhook already created, or shows a pending state.

Only after real payments work: set `NEXT_PUBLIC_CHECKOUT_ENABLED=true`. That
flag also removes the preview banner, so flipping it early would produce a store
that appears able to take orders it cannot.

## Slice 7 — Orders and fulfilment

- `orders`, `order_lines`, `shipments`, `refunds`.
- Implement `OrderRepository`; build `/account/orders` against it.
- Transactional email: confirmation, shipping, refund.
- Order status and tracking.

Blocked on `OPERATIONS_CONTENT_GAPS.md`: carriers, processing times, return
address and refund policy must be settled before this ships.

## Slice 8 — Admin

- Product, inventory, order, and UGC moderation surfaces.
- Role-based access.
- Audit log for anything touching money or stock.

## Slice 9 — Growth

- Discount codes and gift cards.
- Verified-purchase reviews. `ReviewRepository` returns `[]` today and the PDP
  renders no review section; only real reviews should ever populate it.
- UGC submissions with consent capture and moderation.
- Wishlist.
- Analytics sinks registered against the existing `AnalyticsEvent` contract.

## Sequencing

```
1 Catalog import   ← unblocks everything, no code
2 PostgreSQL       ← proves the seam holds
3 Accounts ──┐
4 Carts ─────┴──► 5 Inventory ──► 6 Payment ──► 7 Orders ──► 8 Admin ──► 9 Growth
```

Slices 3 and 4 can run in parallel. Nothing after slice 5 should start before
inventory is trustworthy — overselling is worse than launching later.

## Before taking a real order

- [ ] Terms and Privacy completed **and reviewed by a lawyer**
- [ ] Shipping and returns policies confirmed and published
- [ ] Support contact published with a real response time
- [ ] Legal business identity and tax registration in place
- [ ] Payment provider live and webhook signature verification tested
- [ ] Inventory accurate, with reservations preventing oversell
- [ ] Transactional email deliverable
- [ ] `NEXT_PUBLIC_CHECKOUT_ENABLED=true` set **last**
