# Back-office operator guide

Sign in at **`/admin`** with your staff email and password. Everything you do is
recorded in the audit log (Settings & staff → Audit log). Shopify remains the
store of record: product, stock, order, customer and live-discount changes made
here are made **in Shopify**, and also show in Shopify admin.

> Screens that need the Shopify Admin API (Products, Inventory, Orders,
> Customers, publishing promotions, Analytics sales) show a yellow notice and
> stay read-only until the API is connected — see `launch-checklist.md`.

## Roles

| Role                | Can                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------- |
| Owner / Super Admin | Everything, including approving and publishing promotions, staff, settings, customer exports |
| Operations          | Products, publishing, inventory, orders and fulfilment, drops, inbox                         |
| Content & Marketing | Content CMS, drops, community moderation, promotion drafts, marketing exports                |
| Support             | Orders (view, notes), customers (view, notes), inbox                                         |

## Add a new product (e.g. the next drop)

1. **Products → New product.**
2. Title, description (blank line = new paragraph), product type, tags.
3. **Garment facts** — Fit, Fabric, Care exactly as you want customers to read them. Leave blank if not confirmed; the site will say so.
4. **Options & variants** — e.g. `Size: S, M, L, XL, 2XL`, add `Colour` if needed. Enter price (CAD) for each variant (use _Set every price_), compare-at only if it is a real sale (must be higher), SKU, barcode, weight in grams, and **starting stock** at your location.
5. **Images** — _Upload_ (goes to Shopify Files) and describe each photo (alt text is required).
6. Pick a size guide, SEO title/description.
7. **Save as draft** to check it, or tick the sales channels and **Save & publish (Active)** to put it on sale. It appears on the storefront within seconds.
8. Teasing it first? **Drops & waitlists → New drop** with stage _Coming soon_, a headline and image. Only tick _Release time is confirmed_ when it is — that turns on the countdown. Link the drop to the product handle once the product exists.

## Update stock / restock

**Inventory** → find the variant → type the new _available_ quantity → choose a reason (_Restock received_, _Correction_, _Stock count_, _Damaged_) → **Set**. If a sale happened while your screen was open, Shopify rejects the change instead of overwriting it — reload and try again. Low stock (your threshold in Settings) is highlighted and listed on Overview.

## Run a discount (10% or a bundle)

1. **Promotions** → open a draft (the 10% first-order and Bundle of 2 drafts are already there) or **New draft**.
2. Set the type, title customers see, automatic or code, value, products, dates, usage limits and what it can combine with. **Save draft.**
3. Owner: tick _I have checked the margin impact_ → **Approve**. Missing values (e.g. no code, no percentage) block approval with a clear message.
4. Owner: **Publish to Shopify** — this creates the real Shopify discount; only then do shoppers see it in the cart (as an estimate) and Shopify applies it at checkout.
5. **Pause/Resume** or **End** at any time from the same page.

The FREESKII free-socks draft mirrors the gift campaign your AVADA app runs today; decide whether to recreate it natively (that app does not run on the new storefront).

## Change the homepage hero / announcement / lookbook

**Content.** Each block has its own **Publish** button; changes go live immediately.

- _Announcement bar_: tick Show, type the line, optional link.
- _Hero_: slogan, then each slide — statement label (the bottom-left list), headline, button label/link, light/dark photo tone, up to 3 photos (desktop shows them side by side, phones show the first), focal point X/Y to keep faces in frame. Fill the _Add a slide_ label to add one; tick _Remove_ to drop one (max 5).
- _Homepage sections_: reorder with the position numbers, untick to hide, edit statement/featured/vault/newsletter text. Leave featured handles blank to show the newest in-stock pieces.
- _Lookbook_: photo, description, caption, and product handle(s) for "Shop the look".

If two people edit the same block, the second save is refused with a message — reload to see the other change first.

## Fulfil an order

**Orders** → filter _Paid, awaiting fulfilment_ → open the order → enter carrier, tracking number (and URL if you have it) → keep _Email the customer_ ticked → **Mark as fulfilled**. Shopify sends the shipping confirmation; the customer's account page shows the tracking and progress (it only shows _Delivered_ when the carrier reports it).

## Handle a return / exchange

1. Requests arrive in **Inbox** (type _Return request_ / _Exchange request_, with the order number).
2. Check the refund policy: within 10 days of delivery, unworn with tags, original packaging; sale items final.
3. Reply by email (button on the message) with next steps; set status and add an internal note.
4. On the order, use **Cancel or refund → Record request** (tags the order and logs it), then complete the refund/cancellation in **Shopify admin** (link on the order page), which handles payment reversal, restock and the customer email. Nothing is refunded automatically.

## Moderate Styled By You

**Community** → _pending_. Check the photo, consent badge and handle; add product tags only if factual; **Approve**, **Hide** or **Reject**. Link-only submissions need the photo attached (upload to Shopify Files, paste the URL) before approval. Legacy wall photos show _Legacy wall — confirm consent_.

## Export customers / subscribers

- **Marketing → Export subscribers** — email, status, consent wording and time, source.
- **Drops → Export waitlists**.
- **Customers → Export CSV** (owner only; needs the Admin API).
- **Orders → Export CSV** (respects the current filter/search).
  Exports are logged. Spreadsheet formula injection is neutralised.

## Staff

**Settings & staff → Staff**: add a person with a temporary password (12+ characters, letters and a number), change roles, reset passwords, deactivate. Any change signs that person out everywhere. The last active owner cannot be removed.
