# Vercel Deployment

## Status

The production build is green and the project is ready to deploy. **No preview
deployment was produced** — this session had no Vercel credentials or CLI
access, so nothing was deployed and no URL exists. The instructions below are
what to run; they have not been executed.

## Framework detection

Vercel detects Next.js automatically. Defaults are correct:

| Setting          | Value                  |
| ---------------- | ---------------------- |
| Framework preset | Next.js                |
| Install command  | `npm ci` (default)     |
| Build command    | `next build` (default) |
| Output directory | `.next` (default)      |
| Node version     | 20.x or 22.x           |
| Root directory   | repository root        |

Nothing needs overriding.

## Environment variables

**The storefront builds and runs with zero environment variables.** Every one
below is optional and has a safe default.

| Variable                       | Required | Default                  | Purpose                                                       |
| ------------------------------ | -------- | ------------------------ | ------------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`         | No       | `https://infinityclo.ca` | Canonical URLs, OpenGraph, sitemap. Set per environment.      |
| `NEXT_PUBLIC_CHECKOUT_ENABLED` | No       | unset (false)            | Enables the checkout control. **Leave unset.** See below.     |
| `LEGACY_ORIGIN`                | No       | `https://infinityclo.ca` | Build-time only, read by the importer. Not needed by the app. |

### Recommended per environment

Production:

```
NEXT_PUBLIC_SITE_URL=https://infinityclo.ca
```

Preview:

```
NEXT_PUBLIC_SITE_URL=https://<your-preview>.vercel.app
```

Setting `NEXT_PUBLIC_SITE_URL` on preview keeps canonical tags and the sitemap
pointing at the deployment being reviewed rather than at production.

### About `NEXT_PUBLIC_CHECKOUT_ENABLED`

Do not set this until a real payment provider is integrated.

With it unset, the storefront displays a permanent preview banner, renders the
checkout control disabled, and states that no order can be placed. Setting it to
`true` removes those disclosures while no payment infrastructure exists —
producing a storefront that looks able to take an order it cannot take.

## Future variables (Phase 2)

None are referenced by the current code; they are listed so infrastructure can
be planned.

| Variable                                          | Purpose                              |
| ------------------------------------------------- | ------------------------------------ |
| `DATABASE_URL`                                    | PostgreSQL connection                |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`      | Payments and verified payment events |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`              | Client payment element               |
| `AUTH_SECRET`                                     | Session signing                      |
| `EMAIL_PROVIDER_API_KEY`                          | Transactional and marketing email    |
| `NEXT_PUBLIC_GA_ID` / `NEXT_PUBLIC_META_PIXEL_ID` | Analytics sinks                      |

## Deploying

### Dashboard

1. Import `ME-ztech/infinityclo` in Vercel.
2. Select branch `claude/infnity-storefront-1-0-tyy0zy` (or merge to the default
   branch first).
3. Accept the detected Next.js settings.
4. Add `NEXT_PUBLIC_SITE_URL`.
5. Deploy.

### CLI

```bash
npm i -g vercel
vercel link
vercel env add NEXT_PUBLIC_SITE_URL production
vercel --prod
```

## Verifying a deployment

```bash
npm ci
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm test            # vitest
npm run build       # next build
npm run e2e         # playwright, against the production build
```

All five pass locally as of the last commit.

After deploying, check: the homepage renders, the preview banner is visible,
`/shop` responds, `/robots.txt` and `/sitemap.xml` resolve, the cart drawer
opens, and the checkout control is disabled with its notice.

## Caveats

**The catalog is empty.** Until `npm run import:legacy` runs, every
catalog-driven surface shows its empty state. The site deploys and works; it
just has no products. See `LEGACY_BRAND_AUDIT.md`.

**Product routes are generated at build time.** After importing the catalog, a
redeploy is required for `/products/[slug]` and `/collections/[slug]` to exist.
Static pages revalidate hourly.

**Image optimisation.** All imagery is served from `public/`, so no remote image
domains are needed. `cdn.shopify.com` is listed in `next.config.ts` only for the
importer's debugging mode and can be removed once assets are local.

**Fonts** are self-hosted at build time by `next/font/google`, so the deployment
makes no runtime request to Google.

**No runtime dependency on the legacy site.** The storefront never contacts
`infinityclo.ca`; the importer is a build-time script only.
