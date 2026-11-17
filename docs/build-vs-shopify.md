# Proprietary Commerce vs. Staying on Shopify — Cost, Complexity, Timeline

An honest assessment, written for the owner. The decision to own the platform
has been made; this sets out what that decision costs so it can be run with
open eyes. Dollar figures are **planning estimates**, not quotes — confirm
current vendor pricing before budgeting.

## The short version

- Owning the platform does **not** save money at INFNITY's current size. It
  costs more in engineering than Shopify costs in fees.
- What it buys is control: the checkout, the customer relationship, the data
  model, the roadmap, and no platform that can change prices, rules or terms.
- The largest new cost is not hosting. It is that **someone must be responsible
  for it** — security, uptime, tax correctness, payments edge cases — forever.
- The software risk is now mostly retired: the engine exists and is tested. The
  remaining risk is operational.

## Running costs (monthly, CAD, estimates)

| | Shopify (Basic) | Proprietary |
| --- | --- | --- |
| Platform subscription | roughly $40–55 | $0 |
| Hosting (Vercel Pro) | included | roughly $30 |
| Database (Neon or similar) | included | $0–30 at this scale |
| Email (Resend) | included for transactional | $0–30 |
| Object storage for media | included | under $5 |
| Error monitoring, uptime checks | included | $0–40 |
| Card processing | about 2.8–2.9% + 30¢ (Shopify Payments) | about 2.9% + 30¢ (Stripe) |
| Third-party-gateway surcharge | 0% with Shopify Payments | n/a |
| Apps (reviews, bundles, email) | often $20–150 | $0 — built in or not needed |
| **Fixed monthly total** | **roughly $60–200** | **roughly $60–135** |

Processing fees are the same order of magnitude either way. The fixed costs are
close. **There is no meaningful saving on the invoice.**

## The cost that is not on an invoice

| Responsibility | On Shopify | On the proprietary platform |
| --- | --- | --- |
| Security patches, dependency updates | Shopify | **INFNITY** — a few hours every month, without fail |
| Uptime and incident response | Shopify | **INFNITY** — someone must be reachable when checkout breaks during a drop |
| PCI scope | Shopify | Reduced to the lightest tier (SAQ A) because card fields are Stripe's — but the annual self-assessment is INFNITY's |
| Fraud screening, chargebacks | Shopify tools | Stripe Radar plus INFNITY handling disputes in the Stripe dashboard |
| Sales tax correctness | Shopify Tax | **INFNITY's rate table.** Fine for Canada-only; a real project for US/EU |
| Shipping rates and labels | Shopify Shipping, discounted labels | Flat rates here; labels bought separately (Canada Post, a label service) |
| Backups and recovery | Shopify | **INFNITY** — the database host's backups, tested |
| New features (gift cards, subscriptions, POS, marketplaces) | An app install | A development project |
| Accessibility, privacy-law changes | Theme and platform updates | INFNITY |

Budget a **maintenance retainer**: realistically 6–12 engineering hours a month
for upkeep, plus on-call cover around launches. At typical contractor rates that
is in the range of **$600–1,800 a month** — several times the Shopify
subscription. If nobody is engaged to do this, the platform will decay, and a
decayed checkout is a security and revenue problem.

## One-off cost

| Work | Estimate | State |
| --- | --- | --- |
| Storefront, design system | 80–120 h | Done |
| Commerce engine: catalogue, inventory, checkout, orders, payments | 120–180 h | Done, tested |
| Customer accounts | 40–60 h | Done, tested |
| Admin back office | 100–150 h | Done, tested against the embedded database |
| Migration tooling | 20–30 h | Done; needs a rehearsal on real exports |
| Stripe live integration and UAT | 16–24 h | **Remaining** |
| Production infrastructure, monitoring, backups, runbooks | 16–30 h | **Remaining** |
| Migration rehearsal and cutover | 16–24 h | **Remaining** |
| Media upload and storage in admin | 16–24 h | **Remaining**, can follow launch |
| Legal review of policies, tax setup with an accountant | external | **Remaining**, owner |

A build like this, commissioned from an agency, is commonly quoted in the range
of **$40,000–90,000**. That is the value of what is already in the repository;
the remaining work is roughly **65–100 hours** plus owner and professional
tasks.

## Timeline to "Shopify disconnected"

| Phase | Duration | Depends on |
| --- | --- | --- |
| 1. Infrastructure: database, Stripe test keys, email, staging | 1 week | Owner creating accounts |
| 2. Staging UAT with Stripe test mode | 1–2 weeks | Owner testing; fixes |
| 3. Migration rehearsal on real exports | 1 week | Owner exporting from Shopify |
| 4. Tax registration confirmed, rates entered, policies reviewed | parallel, 1–3 weeks | Accountant, lawyer |
| 5. Stripe live activation, one real order and refund | 2–3 days | Stripe account verification |
| 6. Cutover | 1 day | Owner approval |
| 7. Parallel period with Shopify read-only | 60–90 days | — |
| 8. Shopify retired | — | Owner approval |

**Earliest realistic cutover: 4–6 weeks from the day accounts and exports are
available.** Shopify fully retired about three months after that.

## Risks, ranked

| Risk | Likelihood | Impact | Mitigation in place | Still needed |
| --- | --- | --- | --- | --- |
| Nobody maintains the platform | Medium | High | — | A named maintainer and retainer |
| Checkout failure during a drop | Low–Medium | High | Stock reservations, idempotent order creation, tests | Load test before the first big drop; monitoring and alerts |
| Tax charged wrongly | Medium | Medium–High | Tables start empty; nothing assumed | Accountant confirms registration and rates |
| Oversell | Low | Medium | Conditional reservations, compare-and-set admin edits, oversell flag | Real stock counts imported |
| Data loss | Low | High | One database, managed backups on the host | Enable point-in-time recovery; test a restore |
| Payment/order mismatch | Low | High | Order only from verified webhook with matching amount; daily comparison possible | A reconciliation report against Stripe (not yet built) |
| Account takeover | Low | Medium | scrypt, rate limits, verified email, hashed sessions | Optional two-factor for staff |
| Chargebacks / fraud | Medium | Medium | Stripe Radar defaults | Owner learns the dispute workflow |
| Customer confusion at cutover (passwords reset) | High | Low | Claim-by-email flow, order history preserved | A clear email to customers |
| Key-person dependency on bespoke code | Medium | Medium | Conventional stack, tests, documentation | Second engineer familiar with it |

## When each option is the right one

**Stay on Shopify** if the priority is selling with the least operational
burden, the catalogue is small, and bespoke checkout or data ownership is not
central to the brand.

**Own the platform** if the brand's edge depends on a custom buying experience
(drops, early access, bundles, community), on owning customer data outright,
or on not being subject to a platform's roadmap and pricing — and there is
budget for ongoing engineering.

INFNITY has chosen the second. It is a legitimate choice. It is sustainable only
with a maintainer.

## A middle path, for the record

The earlier architecture in this repository — bespoke storefront, Shopify as the
engine — delivers most of the brand experience at a fraction of the operational
burden. It was set aside on the owner's instruction and its code removed. It
remains the fallback if maintaining a proprietary platform proves too heavy: the
storefront, design system and admin interface would carry over; the engine
would be swapped behind the same interfaces.
