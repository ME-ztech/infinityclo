# Catalogue and Image Inventory — STOREFRONT 1.1

The 1.1 brief asked for an audit of the live INFNITY catalogue: every
discoverable product, its imagery, price, sizes, description and collection.
This is that report, plus an honest account of what could and could not be
recovered from this build environment.

## The blocker, stated plainly

`infinityclo.ca` and `cdn.shopify.com` are **denied by this session's egress
policy**. Every route was tried:

| Route                          | Result                                           |
| ------------------------------ | ------------------------------------------------ |
| `curl https://infinityclo.ca`  | `CONNECT tunnel failed, 403` at the egress proxy |
| `curl https://cdn.shopify.com` | Blocked                                          |
| `WebFetch` on either host      | `EGRESS_BLOCKED`                                 |
| `infinityclo.vercel.app`       | Blocked                                          |
| `infinityclo.myshopify.com`    | Blocked                                          |

The proxy's own status endpoint records the denials as
`connect_rejected — gateway answered 403 to CONNECT (policy denial)`. Its
documentation is explicit that policy denials must be reported rather than
worked around, so no attempt was made to route around them.

**Consequence: zero photographs could be downloaded in this environment.** That
is the one part of the brief that could not be executed here, and it is not
something more effort would have solved.

## How the storefront gets real photography anyway

The import runs at **build time on Vercel**, where egress is not restricted.

```
prebuild → scripts/prepare-catalog.mjs → scripts/import-infnity-catalog.ts
```

`prepare-catalog.mjs` fires before `next build`. If the committed snapshot at
`src/data/catalog/products.json` already has products, it does nothing — a
reviewed catalogue is never silently replaced by a fresh scrape. Otherwise it
runs the importer, which:

1. Walks `/products.json` and `/collections.json`.
2. Downloads every photograph into `public/products/<slug>/NN-<hash>.<ext>`,
   requesting a 1600px delivery width from the CDN rather than the master file.
3. Normalises everything into the domain model.
4. Writes `products.json`, `collections.json`, `manifest.json` and
   `docs/ASSET_PROVENANCE.md`.

Assets written during `prebuild` are part of the build output, so the running
storefront never contacts infinityclo.ca. Import once, normalise, store locally,
render reliably.

It is bounded (240s), it can never fail the build, and if it cannot reach the
source it says so in the deploy log and falls through to the seed below.

Run it manually from any unrestricted machine:

```bash
npm run import:catalog
git add public/products src/data/catalog docs/ASSET_PROVENANCE.md
git commit -m "Import INFNITY catalogue"
```

That commits the real catalogue permanently and the build-time import stops
running.

## What the storefront serves today

`src/data/catalog/seed.ts` — **10 products, real names, real prices**,
transcribed from the store owner's own screenshots of
`infinityclo.ca/collections/all` (captured 2026-08-12, supplied with the brief).

| #   | Product                                       | Price  | Compare-at | Sale | Section     |
| --- | --------------------------------------------- | ------ | ---------- | ---- | ----------- |
| 1   | INFNITY'S Iced Raven Tank                     | $29.99 | $60.00     | −50% | Tops        |
| 2   | INFNITY'S Iced Soft Blush Tank                | $29.00 | $60.00     | −52% | Tops        |
| 3   | INFNITY'S Iced Ivory Pearl Tank               | $29.99 | $60.00     | −50% | Tops        |
| 4   | INFNITY'S Reversible Obsidian Blank Hoodie    | $60.00 | —          | —    | Hoodies     |
| 5   | INFNITY'S Crew Socks Pack                     | $9.99  | —          | —    | Accessories |
| 6   | INFNITY'S Jet-Black Jersey                    | $50.00 | $70.67     | −29% | Tops        |
| 7   | INFNITY'S Ivy Moss Jersey                     | $50.00 | $70.67     | −29% | Tops        |
| 8   | INFNITY'S Crimson Static Jersey               | $50.00 | $70.67     | −29% | Tops        |
| 9   | INFNITY'S Varsity Hoodie                      | $45.98 | $69.98     | −34% | Hoodies     |
| 10  | INFNITY'S Signature Ivy-Moss Patchwork Hoodie | $75.00 | $85.00     | −12% | Hoodies     |

`featuredRank` preserves the order the pieces appear in on `/collections/all`,
which is real merchandising visible directly in the source screenshots.

### Deliberately absent

Nothing below has been invented to fill a gap:

| Field                | State | Why                                                    |
| -------------------- | ----- | ------------------------------------------------------ |
| Photography          | None  | Egress blocked. Cards render the designed tag plate.   |
| Sizes                | None  | No size run was legible; none has been assumed.        |
| Descriptions         | Null  | The PDP omits the section rather than inventing copy.  |
| Materials, fit, care | Null  | Same.                                                  |
| Model sizing         | Null  | A customer sizes an order against this. Never guessed. |
| Publish dates        | Null  | Nothing is badged NEW on a date we made up.            |
| UGC / testimonials   | Empty | The Troop section is not rendered at all.              |
| Campaign imagery     | Empty | The editorial section is not rendered at all.          |

`src/data/catalog/seed.test.ts` enforces every one of these mechanically, so the
file cannot drift into invented content later.

### One documented deviation

The store lists the **Varsity Hoodie as three separate listings** at an
identical name and price, distinguished only by colourway. They are modelled as
one product with a Colour axis so the catalogue does not show three identical
cards. The values `Cream`, `Black` and `Grey` describe the garments visible in
the screenshots; the brand's own colourway names are unknown and will replace
these at import.

### Products identified but not seeded

Visible in the source screenshots, but their price was cut off — and a
storefront must not display a price it cannot substantiate:

- **INFNI-TEE'S LeCaptain America** — black graphic tee. Its size run _is_
  legible from the product-page screenshot (S sold out; M, L, XL, 2XL
  available), which is the only direct evidence of how INFNITY sizes a garment.
- **White graphic tee** shown beside it in the grid.
- **Ivy-moss sweat shorts** with patchwork badges.
- **Black sweatpants**, stamped SOLD OUT.

All four arrive with the import.

## Gallery and hover readiness

Hover cross-fade on cards and the PDP gallery both need a second photograph.
Neither is reachable on the seed, so:

- `ProductCard` renders a single plate and no cross-fade.
- `ProductGallery` renders one frame and no pagination.
- `CatalogGrid` renders brand-statement breaks instead of campaign-image breaks.

All three light up automatically once media arrives — there is no flag to flip.
`validateSnapshot()` reports single-image products under `gaps` (content that has
not arrived) rather than `errors` (contradictions), and `manifest.json` lists
`productsWithoutMedia` and `productsWithSingleImage` after every import.

The brief notes the Raven tank and the hoodie each expose several photographs on
their product pages, so real gallery and hover states should populate on the
first successful import.

## Vault and archive classification

The importer marks a collection archived when its handle or title matches
`vault|archive|archived|past|sold-out`, and variants inside an archived
collection resolve to `archived` rather than `sold_out`. No product is exposed
as current inventory on the basis of a guess.

The seed contains no archived collection, so `/vault` renders its empty state —
which is the honest outcome, not a bug.
