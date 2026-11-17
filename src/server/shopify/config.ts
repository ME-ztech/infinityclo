import 'server-only';

/**
 * Shopify connection settings, read from the environment only. Secrets are
 * never sent to the browser and never rendered — the admin Integrations screen
 * shows configured/not-configured and the variable *names*.
 */

export const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION ?? '2026-10';

/** The legacy store's permanent domain. Public information; overridable. */
export const DEFAULT_STORE_DOMAIN = 'apparelinifinty85.myshopify.com';

export type CheckoutMode = 'storefront' | 'permalink' | 'disabled';

export interface ShopifyConfig {
  readonly storeDomain: string;
  readonly apiVersion: string;
  readonly storefrontToken: string | null;
  /** True for a private (server) Storefront token, sent as Shopify-Storefront-Private-Token. */
  readonly storefrontTokenIsPrivate: boolean;
  readonly adminToken: string | null;
  readonly customerAccountClientId: string | null;
  readonly customerAccountClientSecret: string | null;
  readonly webhookSecret: string | null;
  readonly defaultCountry: string;
  /** Where "Sign in" goes when the Customer Account API is not configured. */
  readonly hostedAccountUrl: string;
}

export function shopifyConfig(): ShopifyConfig {
  const storeDomain = (process.env.SHOPIFY_STORE_DOMAIN ?? DEFAULT_STORE_DOMAIN).replace(/^https?:\/\//, '').replace(/\/$/, '');
  const privateToken = process.env.SHOPIFY_STOREFRONT_PRIVATE_TOKEN ?? null;
  return {
    storeDomain,
    apiVersion: SHOPIFY_API_VERSION,
    storefrontToken: privateToken ?? process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN ?? null,
    storefrontTokenIsPrivate: Boolean(privateToken),
    adminToken: process.env.SHOPIFY_ADMIN_ACCESS_TOKEN ?? null,
    customerAccountClientId: process.env.SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID ?? null,
    customerAccountClientSecret: process.env.SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_SECRET ?? null,
    webhookSecret: process.env.SHOPIFY_WEBHOOK_SECRET ?? null,
    defaultCountry: process.env.SHOPIFY_DEFAULT_COUNTRY ?? 'CA',
    hostedAccountUrl: process.env.SHOPIFY_HOSTED_ACCOUNT_URL ?? `https://${storeDomain}/account`,
  };
}

export function isStorefrontConfigured(): boolean {
  return Boolean(shopifyConfig().storefrontToken);
}

export function isAdminConfigured(): boolean {
  return Boolean(shopifyConfig().adminToken);
}

export function isCustomerAccountConfigured(): boolean {
  return Boolean(shopifyConfig().customerAccountClientId);
}

export function isWebhookConfigured(): boolean {
  return Boolean(shopifyConfig().webhookSecret);
}

/**
 * How the cart hands off to payment:
 * - `storefront`: Storefront Cart API → `checkoutUrl` (requires a Storefront token)
 * - `permalink`:  Shopify cart permalink with real variant ids — no token needed,
 *                 still Shopify-hosted checkout with Shopify's taxes and shipping
 * - `disabled`:   no hand-off; the cart says so plainly
 *
 * `CHECKOUT_MODE` overrides; otherwise `storefront` when a token exists, else
 * `disabled`. Permalink mode is opt-in because it sends shoppers to the live
 * store's checkout.
 */
export function checkoutMode(): CheckoutMode {
  const explicit = process.env.CHECKOUT_MODE as CheckoutMode | undefined;
  if (explicit === 'disabled') return 'disabled';
  if (explicit === 'permalink') return 'permalink';
  if (explicit === 'storefront') return isStorefrontConfigured() ? 'storefront' : 'disabled';
  return isStorefrontConfigured() ? 'storefront' : 'disabled';
}

export interface IntegrationStatus {
  readonly key: string;
  readonly label: string;
  readonly configured: boolean;
  readonly envVars: readonly string[];
  readonly unlocks: string;
  readonly setup: string;
}

/** Plain-language status for Admin → Settings → Integrations. Never includes values. */
export function integrationStatuses(): IntegrationStatus[] {
  const config = shopifyConfig();
  return [
    {
      key: 'storefront',
      label: 'Shopify Storefront API',
      configured: Boolean(config.storefrontToken),
      envVars: ['SHOPIFY_STORE_DOMAIN', 'SHOPIFY_STOREFRONT_ACCESS_TOKEN (or SHOPIFY_STOREFRONT_PRIVATE_TOKEN)'],
      unlocks: 'Live products, prices and availability; Shopify carts and checkout hand-off.',
      setup: 'Shopify admin → Sales channels → Headless → Create storefront → Storefront API → copy the access token.',
    },
    {
      key: 'customer-account',
      label: 'Shopify Customer Account API',
      configured: Boolean(config.customerAccountClientId),
      envVars: ['SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID', 'SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_SECRET (confidential clients)'],
      unlocks: 'Native sign-in, order history, tracking, addresses and profile on /account.',
      setup:
        'Settings → Customer accounts → choose "Customer accounts"; Headless → Customer Account API settings → add the callback URL https://<site>/account/callback and logout URL https://<site>/.',
    },
    {
      key: 'admin',
      label: 'Shopify Admin API',
      configured: Boolean(config.adminToken),
      envVars: ['SHOPIFY_ADMIN_ACCESS_TOKEN'],
      unlocks: 'Back-office products, media, inventory, orders, fulfilment, customers, live discounts and sales analytics.',
      setup: 'Shopify admin → Settings → Apps and sales channels → Develop apps → create a custom app with the Admin API scopes listed in docs/launch-checklist.md, install it, and copy the Admin API access token.',
    },
    {
      key: 'webhooks',
      label: 'Shopify webhooks',
      configured: Boolean(config.webhookSecret),
      envVars: ['SHOPIFY_WEBHOOK_SECRET'],
      unlocks: 'Instant cache refresh and order/fulfilment activity feed, verified by HMAC.',
      setup: 'Use the custom app’s client secret; subscribe topics to https://<site>/api/webhooks/shopify.',
    },
  ];
}
