/**
 * Server configuration and integration status.
 *
 * Every external dependency of the platform is read here and nowhere else, so
 * there is one place that knows whether an integration is actually connected.
 * The admin "Settings" screen renders `integrationStatus()` directly: it reports
 * variable NAMES and whether they are set, never a value.
 *
 * INFNITY owns its commerce system. The services below are infrastructure —
 * a database host, a payment processor, an email sender, object storage — and
 * each is replaceable without changing a business rule.
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

export type AppEnvironment = 'development' | 'staging' | 'production';

export const config = {
  get isProduction() {
    return process.env.NODE_ENV === 'production';
  },

  /**
   * Which deployment this is. `APP_ENV` is explicit; otherwise Vercel's own
   * environment is used, and a local run is `development`. Staging is a
   * production *build* that must never be mistaken for the live store.
   */
  get environment(): AppEnvironment {
    const explicit = env('APP_ENV');
    if (explicit === 'production' || explicit === 'staging' || explicit === 'development') return explicit;
    if (process.env.VERCEL_ENV === 'production') return 'production';
    if (process.env.VERCEL_ENV === 'preview') return 'staging';
    return process.env.NODE_ENV === 'production' ? 'production' : 'development';
  },

  database: {
    get url() {
      return env('DATABASE_URL');
    },
    /** True when a database is reachable: configured, or the dev fallback applies. */
    get available() {
      return Boolean(env('DATABASE_URL')) || process.env.NODE_ENV !== 'production';
    },
  },

  payments: {
    get stripeSecretKey() {
      return env('STRIPE_SECRET_KEY');
    },
    get stripePublishableKey() {
      return env('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY');
    },
    get stripeWebhookSecret() {
      return env('STRIPE_WEBHOOK_SECRET');
    },
  },

  admin: {
    /**
     * `native`   — the dashboard reads and writes INFNITY's own database.
     * `sandbox`  — a clearly labelled local sandbox for training; nothing it
     *              does is visible to shoppers. Opt-in via COMMERCE_ADMIN_MODE.
     * `disconnected` — no database configured.
     */
    get mode(): 'native' | 'sandbox' | 'disconnected' {
      if (env('COMMERCE_ADMIN_MODE') === 'sandbox') return 'sandbox';
      return config.database.available ? 'native' : 'disconnected';
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
    /** Transactional email (order confirmation, verification, reset, contact). */
    get resendKey() {
      return env('RESEND_API_KEY');
    },
    get contactTo() {
      return env('CONTACT_TO_EMAIL');
    },
    get from() {
      return env('EMAIL_FROM');
    },
    get configured() {
      return Boolean(env('RESEND_API_KEY') && env('EMAIL_FROM'));
    },
  },

  /** Shared secret for the scheduled maintenance route (`/api/cron/maintenance`). */
  get cronSecret() {
    return env('CRON_SECRET');
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
  const stripeKey = config.payments.stripeSecretKey;
  const stripeLive = stripeKey?.startsWith('sk_live_') ?? false;
  const stripeComplete = Boolean(stripeKey && config.payments.stripePublishableKey && config.payments.stripeWebhookSecret);
  const testPayments = !stripeKey && env('PAYMENTS_PROVIDER') === 'test' && (!config.isProduction || env('INFNITY_E2E') === '1');

  return [
    {
      id: 'database',
      label: 'Commerce database (catalogue, stock, customers, orders)',
      status: config.database.url ? 'connected' : config.isProduction ? 'not_connected' : 'partial',
      detail: config.database.url
        ? config.database.url.startsWith('pglite://')
          ? 'Embedded PostgreSQL. Suitable for development and tests only.'
          : 'PostgreSQL connected.'
        : config.isProduction
          ? 'No database. Nothing can be sold or managed until DATABASE_URL is set and migrations are run.'
          : 'No DATABASE_URL: using an embedded development database under ./.data. Set DATABASE_URL before deploying.',
      variables: [variable('DATABASE_URL')],
    },
    {
      id: 'payments',
      label: 'Payments (Stripe)',
      status: stripeComplete ? 'connected' : stripeKey || testPayments ? 'partial' : 'not_connected',
      detail: stripeComplete
        ? stripeLive
          ? 'Stripe LIVE mode. Real cards are charged.'
          : 'Stripe TEST mode. No real money moves; orders are flagged as test.'
        : stripeKey
          ? 'Stripe secret key present but the publishable key or webhook secret is missing. Checkout cannot complete an order without all three.'
          : testPayments
            ? 'Simulated payments for local development and automated tests. Not available in production.'
            : 'No payment provider. Customers can browse and build a cart; checkout is closed.',
      variables: [
        variable('STRIPE_SECRET_KEY'),
        variable('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'),
        variable('STRIPE_WEBHOOK_SECRET'),
      ],
    },
    {
      id: 'email',
      label: 'Transactional email (order confirmation, verification, password reset)',
      status: config.email.configured ? 'connected' : 'not_connected',
      detail: config.email.configured
        ? 'Email provider connected.'
        : config.isProduction
          ? 'No email provider. Customers cannot verify an account or reset a password, and no order confirmation is sent.'
          : 'No email provider. In development, verification and reset links are written to the server log instead of being emailed.',
      variables: [variable('RESEND_API_KEY'), variable('EMAIL_FROM'), variable('CONTACT_TO_EMAIL', false)],
    },
    {
      id: 'sessions',
      label: 'Session signing (staff sign-in)',
      status: config.session.secret ? 'connected' : config.isProduction ? 'not_connected' : 'partial',
      detail: config.session.secret
        ? 'Session secret present.'
        : config.isProduction
          ? 'No session secret. Staff sign-in is disabled in production until one is set.'
          : 'No session secret. A development-only secret is generated locally; set SESSION_SECRET before deploying.',
      variables: [variable('SESSION_SECRET')],
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
      id: 'maintenance',
      label: 'Scheduled maintenance (expired stock holds, abandoned checkouts)',
      status: config.cronSecret ? 'connected' : 'partial',
      detail: config.cronSecret
        ? 'Cron secret present. Schedule /api/cron/maintenance every 10 minutes.'
        : 'No cron secret. Expired stock holds are still released whenever a new checkout starts, but nothing runs on a schedule.',
      variables: [variable('CRON_SECRET', false)],
    },
  ];
}
