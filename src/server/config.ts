/**
 * Server configuration and integration status.
 *
 * Every external dependency of the platform is read here and nowhere else, so
 * there is one place that knows whether an integration is actually connected.
 * The admin "Settings" screen renders `integrationStatus()` directly: it reports
 * variable NAMES and whether they are set, never a value.
 *
 * Nothing in this file throws when a variable is missing. A missing integration
 * degrades to a clearly labelled "not connected" state; it never degrades to a
 * fake success.
 */
import 'server-only';

const env = (name: string): string | null => {
  const value = process.env[name]?.trim();
  return value ? value : null;
};

/**
 * Public facts about the store, read from the legacy storefront's own
 * `/meta.json` during the source audit (docs/source-audit.md). They identify the
 * shop; they grant no access. Each can be overridden per environment.
 */
const PUBLIC_DEFAULTS = {
  storeDomain: 'apparelinifinty85.myshopify.com',
  shopId: '60570697948',
  storefrontApiVersion: '2026-10',
  adminApiVersion: '2026-10',
} as const;

export const config = {
  get isProduction() {
    return process.env.NODE_ENV === 'production';
  },

  shopify: {
    /** The permanent `*.myshopify.com` domain. Survives any DNS cutover. */
    get storeDomain() {
      return env('SHOPIFY_STORE_DOMAIN') ?? PUBLIC_DEFAULTS.storeDomain;
    },
    get shopId() {
      return env('SHOPIFY_SHOP_ID') ?? PUBLIC_DEFAULTS.shopId;
    },
    /**
     * Host that serves Shopify checkout and cart permalinks. Defaults to the
     * permanent domain, which keeps working after `infinityclo.ca` is pointed at
     * this storefront.
     */
    get checkoutDomain() {
      return env('SHOPIFY_CHECKOUT_DOMAIN') ?? this.storeDomain;
    },
    get storefrontApiVersion() {
      return env('SHOPIFY_STOREFRONT_API_VERSION') ?? PUBLIC_DEFAULTS.storefrontApiVersion;
    },
    get adminApiVersion() {
      return env('SHOPIFY_ADMIN_API_VERSION') ?? PUBLIC_DEFAULTS.adminApiVersion;
    },
    /** Optional. Without it the Storefront API is used in its tokenless mode. */
    get storefrontToken() {
      return env('SHOPIFY_STOREFRONT_PRIVATE_TOKEN');
    },
    /** Admin API access token of a custom app. Server-side only. */
    get adminToken() {
      return env('SHOPIFY_ADMIN_ACCESS_TOKEN');
    },
    get webhookSecret() {
      return env('SHOPIFY_WEBHOOK_SECRET');
    },
    get customerAccountClientId() {
      return env('SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID');
    },
    /** `off` disables the live price/stock overlay (tests, offline builds). */
    get liveCatalog() {
      return env('SHOPIFY_LIVE_CATALOG') !== 'off';
    },
  },

  admin: {
    /**
     * `shopify`  — the dashboard reads and writes the real store (needs the
     *              Admin token).
     * `sandbox`  — the dashboard runs against a clearly labelled local sandbox
     *              seeded from the imported catalogue. No real store is touched.
     * Unset     — `shopify` when a token is present, otherwise `disconnected`.
     */
    get mode(): 'shopify' | 'sandbox' | 'disconnected' {
      const requested = env('COMMERCE_ADMIN_MODE');
      if (requested === 'sandbox') return 'sandbox';
      if (config.shopify.adminToken) return 'shopify';
      return 'disconnected';
    },
    get ownerEmail() {
      return env('ADMIN_OWNER_EMAIL')?.toLowerCase() ?? null;
    },
    get ownerPasswordHash() {
      return env('ADMIN_OWNER_PASSWORD_HASH');
    },
  },

  session: {
    get secret() {
      return env('SESSION_SECRET');
    },
  },

  storage: {
    get kvUrl() {
      return env('KV_REST_API_URL') ?? env('UPSTASH_REDIS_REST_URL');
    },
    get kvToken() {
      return env('KV_REST_API_TOKEN') ?? env('UPSTASH_REDIS_REST_TOKEN');
    },
    get dataDir() {
      return env('DATA_DIR') ?? '.data';
    },
  },

  email: {
    /** Transactional sender for contact-form routing. Optional. */
    get resendKey() {
      return env('RESEND_API_KEY');
    },
    get contactTo() {
      return env('CONTACT_TO_EMAIL');
    },
    get from() {
      return env('EMAIL_FROM');
    },
  },
} as const;

export interface IntegrationState {
  readonly id: string;
  readonly label: string;
  readonly status: 'connected' | 'partial' | 'not_connected';
  readonly detail: string;
  /** Variable names involved, with whether each is set. Never a value. */
  readonly variables: ReadonlyArray<{ name: string; set: boolean; required: boolean }>;
}

const variable = (name: string, required = true) => ({ name, set: env(name) !== null, required });

/** What is actually wired up, for the admin Settings screen and the docs. */
export function integrationStatus(): readonly IntegrationState[] {
  const kv = Boolean(config.storage.kvUrl && config.storage.kvToken);
  const onServerless = Boolean(process.env.VERCEL);
  return [
    {
      id: 'storefront',
      label: 'Shopify Storefront API (catalogue, live price and stock)',
      status: 'connected',
      detail: config.shopify.storefrontToken
        ? `Authenticated access to ${config.shopify.storeDomain}.`
        : `Tokenless public access to ${config.shopify.storeDomain}. Sufficient for products, prices and availability; a private token raises rate limits.`,
      variables: [variable('SHOPIFY_STORE_DOMAIN', false), variable('SHOPIFY_STOREFRONT_PRIVATE_TOKEN', false)],
    },
    {
      id: 'checkout',
      label: 'Shopify checkout handoff',
      status: 'connected',
      detail: `Carts are handed to Shopify-hosted checkout on ${config.shopify.checkoutDomain}. Payment, tax, shipping and discounts are computed there.`,
      variables: [variable('SHOPIFY_CHECKOUT_DOMAIN', false)],
    },
    {
      id: 'admin',
      label: 'Shopify Admin API (products, inventory, orders, customers, discounts)',
      status: config.shopify.adminToken ? 'connected' : 'not_connected',
      detail: config.shopify.adminToken
        ? 'Admin token present. The dashboard reads and writes the real store.'
        : config.admin.mode === 'sandbox'
          ? 'No Admin token. The dashboard is running in SANDBOX mode against local data; nothing reaches the real store.'
          : 'No Admin token. Commerce modules are disabled until a custom-app token is configured.',
      variables: [variable('SHOPIFY_ADMIN_ACCESS_TOKEN')],
    },
    {
      id: 'customer-accounts',
      label: 'Shopify Customer Account API (sign-in, orders, addresses)',
      status: config.shopify.customerAccountClientId ? 'connected' : 'not_connected',
      detail: config.shopify.customerAccountClientId
        ? 'OAuth client configured. Customers sign in with Shopify passwordless login.'
        : "No OAuth client id. /account links to the store's Shopify-hosted account page instead.",
      variables: [variable('SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID'), variable('SHOPIFY_SHOP_ID', false)],
    },
    {
      id: 'webhooks',
      label: 'Shopify webhooks',
      status: config.shopify.webhookSecret ? 'connected' : 'not_connected',
      detail: config.shopify.webhookSecret
        ? 'Signing secret present. Deliveries are HMAC-verified and processed idempotently.'
        : 'No signing secret. The webhook endpoint rejects every delivery.',
      variables: [variable('SHOPIFY_WEBHOOK_SECRET')],
    },
    {
      id: 'sessions',
      label: 'Session signing',
      status: config.session.secret ? 'connected' : config.isProduction ? 'not_connected' : 'partial',
      detail: config.session.secret
        ? 'Session secret present.'
        : config.isProduction
          ? 'No session secret. Admin and customer sign-in are disabled in production until one is set.'
          : 'No session secret. A development-only secret is generated locally; set SESSION_SECRET before deploying.',
      variables: [variable('SESSION_SECRET')],
    },
    {
      id: 'storage',
      label: 'Durable storage (content, offers, subscribers, community, audit log)',
      status: kv ? 'connected' : onServerless ? 'not_connected' : 'partial',
      detail: kv
        ? 'Redis-compatible KV store connected.'
        : onServerless
          ? 'No KV store. This host has no durable filesystem, so admin changes will not persist. Connect a KV store before using the dashboard here.'
          : `File store at ./${config.storage.dataDir}. Durable on a single server or laptop; use a KV store on serverless hosts.`,
      variables: [variable('KV_REST_API_URL', onServerless), variable('KV_REST_API_TOKEN', onServerless)],
    },
    {
      id: 'admin-login',
      label: 'Admin owner account',
      status: config.admin.ownerEmail && config.admin.ownerPasswordHash ? 'connected' : 'not_connected',
      detail:
        config.admin.ownerEmail && config.admin.ownerPasswordHash
          ? 'Owner credentials configured.'
          : 'No owner account. Run `npm run admin:setup` to create one; /admin cannot be signed in to until then.',
      variables: [variable('ADMIN_OWNER_EMAIL'), variable('ADMIN_OWNER_PASSWORD_HASH')],
    },
    {
      id: 'email',
      label: 'Contact-form email routing',
      status: config.email.resendKey && config.email.contactTo && config.email.from ? 'connected' : 'not_connected',
      detail:
        config.email.resendKey && config.email.contactTo && config.email.from
          ? 'Messages are stored in the admin inbox and emailed to the configured address.'
          : 'No email provider. Messages are stored in the admin inbox only; nothing is emailed.',
      variables: [variable('RESEND_API_KEY', false), variable('CONTACT_TO_EMAIL', false), variable('EMAIL_FROM', false)],
    },
  ];
}
