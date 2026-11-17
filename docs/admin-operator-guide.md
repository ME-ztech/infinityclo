# Admin Operator Guide

For the owner and staff. Everything here is done at `/admin`; nothing needs a
developer.

## Signing in

Go to `/admin`. The coloured bar at the top says which system you are in:

| Bar | Meaning |
| --- | ------- |
| Red — "Live" | The real store. Changes are visible to customers. |
| Blue — "staging" or "development" | A copy for testing. Not the live store. |
| Amber — "Sandbox" | A training mode. Nothing is real. |

After five wrong passwords sign-in pauses for 15 minutes.

## Roles

| Role | Can do |
| ---- | ------ |
| Owner | Everything, including activating discounts, refunds, staff and settings |
| Operations | Products, stock, orders, fulfilment, refunds, customers |
| Content | Homepage, lookbook, drops, community moderation, subscribers |
| Support | Customers, orders (view), inbox |

Add staff in **Settings → Staff**. Give each person the lowest role that lets
them do their job.

## Add a product

1. **Products → New product.**
2. Enter the title, description, type (for example "Hoodies") and price.
3. Add options. For sizes: option name `Size`, values `S, M, L, XL, 2XL`. A
   second option such as `Colour` creates every combination.
4. Save. The product is a **draft** — not visible to customers.
5. On the product page: set a price, compare-at price, SKU and weight per
   variant; add photographs by link; fill in **Fit**, **Fabric** and **Care**
   (leave any blank that you have not confirmed — the page simply omits it);
   choose a size chart.
6. Go to **Inventory** and count stock in (below). A new variant starts at zero
   and cannot be bought until you do.
7. Back on the product, press **Publish**. It appears on the site within
   seconds.

Photographs today are added by link (a file already on the site, or an
`https://` image address). Uploading files from your computer is planned.

## Update stock

**Inventory** lists every variant with what is available, what is committed to
orders, and what is on hand.

1. Find the variant (search by product, variant or SKU).
2. Type the new **available** number, choose a reason, press **Save**.

If someone bought one, or a colleague changed the number, since you loaded the
page, you will be told the stock changed. Reload and try again — this is what
stops two people overwriting each other.

"Quantity unverified" means the item was imported as available but has never
been counted. Count it in before launch.

## Fulfil an order

1. **Orders** → open the order.
2. Check the items and the shipping address.
3. Under **Fulfil**, enter the carrier, tracking number and tracking link,
   tick "email the customer" if you want them notified, type `FULFIL`, confirm.

Stock is taken off the shelf at this moment. The customer sees "Shipped" and
the tracking link in their account. When you know it has arrived, press
**Mark delivered** — the site never says "delivered" on its own.

## Refunds and returns

On the order: **Refund**, enter the amount and reason, type `REFUND`. The money
goes back to the customer's original payment method through Stripe and the
order shows as partly or fully refunded. You cannot refund more than was paid,
and pressing the button twice does not refund twice.

For a return, refund once the item is back, then put it back on sale in
**Inventory** by raising the available number with the reason "Return
restocked".

Customer requests arrive in **Inbox** (from the contact form and from
"Help & returns" in their account). The policy: 10 days from receipt, unworn,
tagged, original packaging; sale items are not returnable.

Orders imported from the old Shopify store are records only. They cannot be
refunded here; do those in Shopify while it remains open.

## Cancel an order

On an order that has **not shipped**: **Cancel**, give a reason, choose whether
to refund, type `CANCEL`. The items go back on sale. An order that has shipped
cannot be cancelled — refund it as a return instead.

## Discounts and bundles

Everything starts as a **draft** and stays invisible to customers until an
Owner activates it.

1. **Promotions → New offer.**
2. Choose **Percentage** (for example 10% off) or **Bundle** (for example 15%
   off when buying 2 or more).
3. Choose who it is for (everyone, or first order only), what it applies to
   (everything, chosen products, or categories), whether sale items are
   excluded, dates, and limits.
4. Save. Status: **Draft**.
5. An Owner opens it, ticks the **margin check** (confirming the numbers still
   work at this discount), types `ACTIVATE`.

Two drafts are provided to start from: "10% first order" and "Bundle: 2 or
more". Neither is live.

- **Pause** stops it immediately and can be undone.
- **End** removes it for good.
- A live offer cannot be edited — pause it first, so the site and the checkout
  never disagree.
- One discount applies per order: a code the customer enters, otherwise the
  automatic one that saves them the most.

## Homepage and hero

**Content** is one page:

- **Announcement bar** — a line above the header, on or off.
- **Hero slides** — up to three photographs per slide (phones show the first),
  a small line, a title, a button and its link; text colour and darkening for
  contrast. Use the arrows to reorder; untick to hide.
- **Section order** — move sections up or down, or switch them off.
- **Featured products**, **Vault**, **Lookbook**, **Community**, **Newsletter**
  wording.
- **You may also like** — on product pages and, separately, in the cart.
- **Social links** and **contact email**.

Save, and the site updates within seconds.

## Launch a new product ("drop")

1. **Drops → New drop**, with an internal working name only you see.
2. Add what you are ready to reveal: public name, teaser line, image, release
   date. Leave the rest empty — the site shows only what you have filled in. A
   countdown appears only when you tick **release date confirmed**.
3. Move it to **Coming soon**. A teaser with a waitlist form appears on the
   homepage.
4. Use the **preview link** to see it before it is public.
5. Create the product itself under Products as a draft.
6. On launch day: publish the product, link it to the drop, move the drop to
   **Published**.
7. **Waitlist** on the drop page lists everyone who signed up; export as CSV.

To schedule a launch, a developer can set the product's publish time; a
scheduling field in the admin is planned.

## Community wall

**Community** shows the wall carried over from the old site and new
submissions.

- **Hide** removes a photo from the site; **Show** brings it back.
- New submissions arrive as **pending** with the person's consent wording and
  email. Approve only photos you are satisfied the person had the right to
  share. You can tag the products in the shot.

## Customers

**Customers** — search by name, email or order number. Each profile shows
orders, total spent, whether they accept marketing email, and your private
notes and tags. **Export** downloads a CSV.

You cannot see passwords or card details; neither is stored here.

## Subscribers

**Marketing** lists everyone who asked for emails, with the exact wording they
agreed to, when and where. Export it for your email tool. This site does not
send marketing email itself.

A customer who ticked "remind me" at checkout and did not finish gets one
reminder. Nobody else does.

## Settings

- **Integrations** — whether the database, payments and email are connected.
  Shows the setting names only, never a secret.
- **Checkout readiness** — if checkout is closed, this says exactly why.
- **Shipping rates** — name, countries, price, optional "free over" amount.
  With no rate, checkout is closed.
- **Tax rates** — enter only what your accountant has confirmed. With no rate,
  no tax is charged.
- **Low-stock threshold**, **Staff**, **Audit log** (who did what, when).

## If something looks wrong

| Symptom | Check |
| ------- | ----- |
| Customers cannot check out | Settings → Checkout readiness |
| A product is not on the site | Is it published? Does it have stock? |
| An order is missing | Stripe dashboard → the payment → webhook delivery. Do not ask the customer to pay again. |
| "Oversold" on an order | Payment arrived after the hold on the stock expired. Confirm you have the item before shipping; otherwise refund. |
| You are locked out | Wait 15 minutes; another Owner can reset your password in Settings |
