# Deployment and Rollback

## Environments

Three, fully separate. Each has its own database, Stripe keys and secrets.

| Environment | `APP_ENV` | Database | Payments | Purpose |
| ----------- | --------- | -------- | -------- | ------- |
| Development | `development` | Embedded PostgreSQL in `./.data` (automatic) | Simulated (`PAYMENTS_PROVIDER=test`) or Stripe test keys | Building |
| Staging | `staging` | Its own PostgreSQL | Stripe **test** keys | Owner UAT, migration rehearsal |
| Production | `production` | Its own PostgreSQL, backups on | Stripe **live** keys | Customers |

The admin shows the environment on every screen; only production is red.
Simulated payments cannot be enabled on a production deployment.

## Local

```bash
npm ci
```

```bash
npm run admin:setup -- you@example.com
```

```bash
npm run dev
```

Storefront at `http://localhost:3000`, back office at `/admin`. With no
`DATABASE_URL`, an embedded database is created and the catalogue is imported
on first run. Add `PAYMENTS_PROVIDER=test` to `.env.local` to try checkout with
simulated payments. Verification and reset emails are printed to the terminal.

## Environment variables

| Variable | Dev | Staging | Production | Notes |
| -------- | --- | ------- | ---------- | ----- |
| `DATABASE_URL` | optional | required | required | `postgres://…` |
| `APP_ENV` | — | `staging` | `production` | Inferred on Vercel if unset |
| `NEXT_PUBLIC_SITE_URL` | optional | staging URL | `https://infinityclo.ca` | Links in emails, canonical URLs |
| `STRIPE_SECRET_KEY` | optional | `sk_test_…` | `sk_live_…` | Server only |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | optional | `pk_test_…` | `pk_live_…` | |
| `STRIPE_WEBHOOK_SECRET` | optional | required | required | From the webhook endpoint in Stripe |
| `SESSION_SECRET` | generated | required | required | 32+ random characters; different per environment |
| `ADMIN_OWNER_EMAIL`, `ADMIN_OWNER_PASSWORD_HASH` | via `admin:setup` | required | required | The hash, never the password |
| `RESEND_API_KEY`, `EMAIL_FROM` | optional | recommended | required | Without them no verification, reset or confirmation email |
| `CONTACT_TO_EMAIL` | optional | optional | recommended | Where contact-form copies go |
| `CRON_SECRET` | — | recommended | required | Protects `/api/cron/maintenance` |
| `PAYMENTS_PROVIDER=test` | optional | **never** | **never** | Ignored in production builds |

Never commit a value for any of these. `.env*.local` is git-ignored.

## First deployment of an environment

1. Create the database (Neon or any PostgreSQL 15+). Enable point-in-time
   recovery on production.
2. Set the environment variables on the host.
3. Apply the schema, from a machine with `DATABASE_URL` set to that database:

```bash
npm run db:migrate
```

4. Load data: `npm run db:seed` for the catalogue, then the migration steps in
   `migration-plan.md`.
5. Deploy (Vercel: import the repository, framework preset Next.js, no
   overrides).
6. In Stripe → Developers → Webhooks, add `https://<host>/api/webhooks/stripe`
   with events `payment_intent.succeeded`, `payment_intent.payment_failed`,
   `payment_intent.canceled`. Copy its signing secret into
   `STRIPE_WEBHOOK_SECRET` and redeploy.
7. Schedule `GET /api/cron/maintenance` every 10 minutes with header
   `Authorization: Bearer <CRON_SECRET>`.
8. Sign in to `/admin` → Settings. Add shipping rates. Enter tax rates only once
   confirmed. The Settings page lists anything still missing for checkout.

No deployment was made from the build session; publishing a site and creating
cloud resources need the owner's accounts.

## Releasing a change

1. Merge to the release branch. `.github/workflows/ci.yml` runs typecheck, lint,
   unit and integration tests, a dependency audit, the build and the browser
   tests. (The workflow is committed but has not yet run on GitHub; expect to
   tune it on its first run.)
2. If the change includes a migration, apply it to **staging** and test there.
3. Apply the migration to production (`npm run db:migrate`), then deploy.

Migrations must be backward-compatible with the running code — add columns and
tables first, remove old ones in a later release — so the deploy and the
migration can happen in either order and a rollback of the code never meets a
schema it cannot read.

## Smoke test after every production deploy

| Check | Expected |
| ----- | -------- |
| `/` and `/shop` | Real products, CAD prices |
| A sold-out size | Struck through, cannot be added |
| Add to cart → Checkout | Checkout page with correct subtotal |
| Admin → Settings | Every integration "connected"; checkout readiness "open" |
| Stripe dashboard → Webhooks | Recent deliveries succeeding |
| `/admin` signed out | Redirects to sign-in |
| `/sitemap.xml`, `/robots.txt` | Present |

## Rollback

| Situation | Action | Time |
| --------- | ------ | ---- |
| Bad deploy, schema unchanged | Vercel → Deployments → previous → Promote | Seconds |
| Bad deploy that included a migration | Promote the previous deployment (migrations are backward-compatible). Fix forward with a new migration; do not hand-edit the database | Minutes |
| Data damaged by a bug or mistake | Restore the database to a point in time on a new branch, verify, then switch `DATABASE_URL` | 15–60 min |
| A discount activated by mistake | Admin → Promotions → Pause | Immediate |
| Checkout must stop now | Set `NEXT_PUBLIC_CHECKOUT_ENABLED=false` and redeploy; or deactivate every shipping rate (takes effect immediately, no deploy) | Immediate / minutes |
| Stripe keys suspected leaked | Roll the keys in Stripe, update the variables, redeploy | Minutes |
| Staff credentials suspected leaked | Rotate `SESSION_SECRET` (signs all staff out), disable the account in Admin → Settings | Minutes |
| Return to Shopify (during the parallel period only) | See `migration-plan.md` | DNS TTL |

## Backups and recovery

- **Database:** managed backups with point-in-time recovery, retention at least
  7 days (30 preferred). This one database holds the entire business: catalogue,
  stock, customers, orders, content, audit log.
- **Photographs:** in the repository today, so Git is the backup.
- **Drill:** once before launch and quarterly — restore to a branch, run
  `npm run db:status`, confirm order and customer counts.
- **Recovery objectives to agree with the owner:** how much data may be lost
  (minutes, with PITR) and how long the store may be down.

## Operational notes

- The embedded development database is single-process. Never point two running
  servers at the same `pglite://` folder.
- Rate limits are per server instance; add an edge rule before launch.
- Community photo uploads need durable storage; on a serverless host the upload
  endpoint reports itself unavailable rather than losing files.
- Catalogue pages are cached for 60 seconds and refreshed immediately when
  stock is reserved, released or sold, and on every admin edit.
