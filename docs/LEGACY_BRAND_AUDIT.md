# Legacy Brand Audit

**Status: BLOCKED — the audit could not be performed.**

## What happened

The forensic audit of `infinityclo.ca` specified for this phase could not be
carried out. This environment's network egress policy denies the legacy domain
and its asset CDN at the gateway, for every tool available in the session:

| Host                   | Purpose                                        | Result                             |
| ---------------------- | ---------------------------------------------- | ---------------------------------- |
| `infinityclo.ca`       | Storefront, catalog, product pages, brand copy | `403` to `CONNECT` — policy denial |
| `cdn.shopify.com`      | All product, model and campaign photography    | `403` to `CONNECT` — policy denial |
| `www.instagram.com`    | Social reference, customer gallery             | `403` to `CONNECT` — policy denial |
| `registry.npmjs.org`   | Build toolchain                                | `200` — reachable                  |
| `fonts.googleapis.com` | Web fonts                                      | reachable                          |

Both the shell (`curl`) and the server-side fetch tool returned the same denial,
recorded by the proxy as `connect_rejected: gateway answered 403 to CONNECT
(policy denial or upstream failure)`.

This is an organisation policy decision enforced outside the container. The
proxy's own documentation instructs that such denials must be reported rather
than retried or routed around, and the brief separately requires that access
controls on external services are not circumvented. No workaround was attempted.

## What this means for the rebuild

Everything in this audit that depends on reading the source — the product
catalog, prices, variants, descriptions, imagery, collection history, customer
gallery, policy copy — is **unavailable**, not merely incomplete. Nothing has
been reconstructed from memory or inference, and no substitute content has been
introduced anywhere in the storefront.

The consequence is visible rather than hidden: the committed catalog snapshot is
empty, and every catalog-driven surface renders an explicit empty state saying
the data has not been imported.

## What could be established

A small amount of brand language surfaced through a search engine's index of the
site. It is second-hand and should be verified against the live site before being
treated as canonical.

| Element                | Value                                                                                                                             | Confidence              |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Brand name as rendered | `Infnity.clo`                                                                                                                     | Indexed page title      |
| Tagline                | "Be the Statement!!!"                                                                                                             | Indexed page title      |
| Positioning copy       | "where raw identity meets untouchable design", "for the ones who don't fold, don't follow — and never settle", "For the FLY only" | Indexed description     |
| Domain                 | `infinityclo.ca`                                                                                                                  | Confirmed               |
| Category               | Streetwear / clothing                                                                                                             | Inferred from the above |

### Naming inconsistency — corrected in the rebuild

The source spells the brand at least two ways: the wordmark and handle read
**INFNITY / Infnity.clo** (no second `i`), while the domain reads
**infinityclo.ca**. The rebuild standardises on:

- **INFNITY** as the brand name in all copy and metadata
- **infnity.clo** as the handle
- **infinityclo.ca** as the domain

This is centralised in `src/lib/site.ts` so the codebase cannot drift, and so a
single edit changes it everywhere if the brand prefers the other spelling.

Two brand names in circulation is also an SEO problem — it splits authority
across two identities. Whichever spelling wins, it should be used consistently.

## What was preserved

Working only from the confirmed material above, the rebuild carries forward:

- The **INFNITY** identity and its deliberate missing `i`
- **BE THE STATEMENT** as the primary campaign line, elevated to the hero
- **THE VAULT** as the archive concept, with "Past drops. Old stories. Still INFNITY."
- **THE TROOP** / **STYLED BY YOU** as the community surface
- The black-first visual foundation
- The "don't fold, don't follow" voice, used in the homepage editorial block
- Streetwear typographic character: heavy condensed display type, square corners,
  high contrast, no soft-luxury or SaaS styling

## What could not be audited

Everything below requires access to the source and is outstanding:

- Product catalog: names, slugs, prices, compare-at prices, variants, sizes,
  colours, descriptions, materials, fit, imagery, collection association,
  availability, legacy URLs
- Logo files and wordmark artwork (the current wordmark is set in type — see
  `src/components/ui/Wordmark.tsx`)
- Typography actually used by the brand
- Brand colour values beyond "black foundation"
- Photography: hero, editorial, product, detail, campaign
- Customer gallery / UGC and social attribution
- Collection and drop history, season labels, release dates
- Existing navigation structure and hierarchy
- Existing policy and contact copy
- Social handles

## Problems identified from the brief, and how the rebuild addresses them

The brief names specific defects in the legacy site. These could not be verified
first-hand, but the rebuild is built so they cannot recur:

| Legacy problem               | How the rebuild prevents it                                                             |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| Weak navigation              | Six-item primary nav, active-state indication, full-screen mobile nav at display scale  |
| Broken hierarchy             | One `h1` per route, ordered heading levels, semantic landmarks                          |
| Thin collection experience   | Dedicated collection routes with hero, description, drop label and product grid         |
| Inconsistent typography      | Two families with defined roles, a fluid type scale in tokens                           |
| Inconsistent spelling        | Brand naming centralised in `src/lib/site.ts`                                           |
| Product description mistakes | Unconfirmed fields are `null` and simply not rendered                                   |
| Empty signup surfaces        | Real validated newsletter capture with an adapter seam                                  |
| Poor merchandising           | Editorial homepage sequence, related products, shoppable UGC                            |
| Bad responsive behaviour     | Mobile-first, `overflow-x: clip` guard, tables and rails scroll in their own containers |
| Policy copy problems         | Policy pages state what is settled and explicitly flag what is not                      |
| Weak product discovery       | Faceted filtering, four sorts, URL-persisted state, scored search                       |

## To complete this audit

Allow `infinityclo.ca` and `cdn.shopify.com` for this environment, then run:

```bash
npm run import:legacy
```

The importer reads the public catalog once, normalises it into the domain model,
migrates the imagery into `public/assets`, and regenerates
`docs/ASSET_PROVENANCE.md`. It writes no snapshot at all if the host is
unreachable, so a partial or invented catalog cannot be produced by accident.
