# Operations & Content Gaps

Everything here needs confirmation from the brand before the store can take
orders. Each item is currently rendered as an explicit "pending" notice on the
relevant page rather than filled with a plausible default — a fabricated
shipping window or return address is a promise to a customer that nobody has
agreed to keep.

## Blocking — must be resolved before taking payment

### Legal identity

| Item                       | Where it surfaces      | Status  |
| -------------------------- | ---------------------- | ------- |
| Registered business name   | Terms, Privacy, footer | Missing |
| Business address           | Terms, Privacy         | Missing |
| Governing jurisdiction     | Terms                  | Missing |
| Tax registration (GST/HST) | Checkout, invoices     | Missing |

Both `/terms` and `/privacy` carry a visible notice that they are incomplete and
have not had legal review. **They must be completed and reviewed by a lawyer
before the store accepts an order.** They are not templates that can be shipped
as-is.

### Shipping

| Item                                      | Status  |
| ----------------------------------------- | ------- |
| Order processing time                     | Missing |
| Destinations served                       | Missing |
| Carrier(s) and service levels             | Missing |
| Rates, and any free-shipping threshold    | Missing |
| Delivery estimates                        | Missing |
| Customs/duties handling for international | Missing |

The free-shipping progress component described in the brief has deliberately
**not** been built. It can only exist once there is a real threshold; building
it against an invented number would put a false incentive in front of customers.

### Returns

| Item                         | Status  |
| ---------------------------- | ------- |
| Return window (days)         | Missing |
| Condition requirements       | Missing |
| Return address               | Missing |
| Who pays return shipping     | Missing |
| Refund method and timing     | Missing |
| Exchange policy              | Missing |
| Whether sale items are final | Missing |

### Contact

| Item                       | Status  |
| -------------------------- | ------- |
| Support email address      | Missing |
| Expected response time     | Missing |
| Support hours and timezone | Missing |

`/contact` publishes no email address and no response time. The form validates
fully but reports plainly that the message was not sent, because no mail
transport exists — a "we'll be in touch" confirmation would leave a customer
waiting on a reply that could never come.

## Non-blocking — needed for completeness

### Social

Social links are configured as an empty list in `src/lib/site.ts`, so the footer
renders no social row at all rather than dead icons. Needed: the live handles
for each platform the brand actually maintains.

### Product data

Covered in detail in `BRAND_STORY_INPUTS_NEEDED.md` (Q11–Q16): materials,
weights, fit, care, origin, and garment measurements. All are `null` and all
render as omitted sections.

### The Troop / UGC

| Item                                     | Status  |
| ---------------------------------------- | ------- |
| Customer images to feature               | Missing |
| Written permission to publish each image | Missing |
| Whether handles may be shown             | Missing |
| Moderation policy for future submissions | Missing |

The submission CTA is a UI shell that captures interest via the newsletter. It
does not accept uploads, because there is no moderation pipeline and no consent
flow behind it.

### Email

No provider is connected. `/api/newsletter` validates the address and returns a
confirmation **without storing it** — the alternative was keeping addresses with
no consent record, retention policy or unsubscribe path, which is worse than not
keeping them.

Needed: the provider, the list, the consent wording, and the unsubscribe route.
Once connected, `/privacy` needs updating to name the processor.

### Analytics

None connected, and none required to build. The event contract exists in
`src/lib/analytics.ts`. If analytics are added, `/privacy` and a consent
mechanism must land in the same change.

## Deliberately not built

| Thing                        | Why                                                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Working checkout             | No payment provider. Nothing may represent a payment as successful.                                                    |
| Account sign-in form         | A form that discards a password trains customers to hand credentials to something that does nothing with them.         |
| Customer reviews             | None exist. The repository returns `[]` and the PDP renders no review section.                                         |
| Free-shipping progress bar   | Requires a real threshold.                                                                                             |
| Stock counts / "only 2 left" | The public source exposes a boolean. Inventing scarcity is out of bounds.                                              |
| Drop dates and season labels | Shopify's `published_at` is a publication timestamp, not a drop date. Promoting it would fabricate collection history. |
