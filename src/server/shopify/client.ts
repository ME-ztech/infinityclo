/**
 * Shopify GraphQL clients.
 *
 *   storefrontQuery  Storefront API. Works tokenless for public catalogue data;
 *                    sends the private token when one is configured.
 *   adminQuery       Admin API. Server-side only, requires the custom-app token.
 *
 * Both retry on throttling (HTTP 429 and GraphQL `THROTTLED`) and on transient
 * 5xx responses with bounded exponential backoff, and both surface GraphQL
 * `userErrors` as real errors rather than letting a failed mutation look like a
 * success.
 */
import 'server-only';

import { config } from '../config';

export class ShopifyError extends Error {
  constructor(
    message: string,
    readonly code: 'not_configured' | 'unauthorized' | 'throttled' | 'user_error' | 'network' | 'graphql',
    readonly details: readonly string[] = [],
  ) {
    super(message);
    this.name = 'ShopifyError';
  }
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
}

interface RequestOptions {
  readonly variables?: Record<string, unknown>;
  /** Next.js cache lifetime in seconds. Omit for uncached requests. */
  readonly revalidate?: number;
  readonly tags?: string[];
  readonly fetcher?: typeof fetch;
  readonly maxAttempts?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function graphql<T>(
  url: string,
  headers: Record<string, string>,
  query: string,
  options: RequestOptions,
): Promise<T> {
  const fetcher = options.fetcher ?? fetch;
  const maxAttempts = options.maxAttempts ?? 4;
  let lastError: ShopifyError | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetcher(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json', ...headers },
        body: JSON.stringify({ query, variables: options.variables ?? {} }),
        signal: AbortSignal.timeout(15_000),
        ...(options.revalidate !== undefined
          ? { next: { revalidate: options.revalidate, tags: options.tags } }
          : { cache: 'no-store' as const }),
      });
    } catch (error) {
      lastError = new ShopifyError(`Could not reach Shopify: ${(error as Error).message}`, 'network');
      if (attempt < maxAttempts) await sleep(300 * 2 ** (attempt - 1));
      continue;
    }

    if (response.status === 401 || response.status === 403) {
      throw new ShopifyError('Shopify rejected the credentials for this request.', 'unauthorized');
    }
    if (response.status === 429 || response.status >= 500) {
      const retryAfter = Number(response.headers.get('retry-after'));
      lastError = new ShopifyError(`Shopify responded ${response.status}.`, response.status === 429 ? 'throttled' : 'network');
      if (attempt < maxAttempts) await sleep(retryAfter > 0 ? retryAfter * 1000 : 400 * 2 ** (attempt - 1));
      continue;
    }
    if (!response.ok) {
      throw new ShopifyError(`Shopify responded ${response.status}.`, 'network');
    }

    const body = (await response.json()) as GraphQLResponse<T>;
    if (body.errors?.length) {
      const throttled = body.errors.some((error) => error.extensions?.code === 'THROTTLED');
      if (throttled && attempt < maxAttempts) {
        lastError = new ShopifyError('Shopify throttled this request.', 'throttled');
        await sleep(1000 * attempt);
        continue;
      }
      // A partial response with data is still usable (e.g. a field this access
      // level cannot read); a response with no data at all is a failure.
      if (!body.data) {
        throw new ShopifyError(
          body.errors[0]?.message ?? 'Shopify returned an error.',
          throttled ? 'throttled' : 'graphql',
          body.errors.map((error) => error.message),
        );
      }
    }
    if (!body.data) throw new ShopifyError('Shopify returned an empty response.', 'graphql');
    return body.data;
  }
  throw lastError ?? new ShopifyError('Shopify request failed.', 'network');
}

export function storefrontQuery<T>(query: string, options: RequestOptions = {}): Promise<T> {
  const { storeDomain, storefrontApiVersion, storefrontToken } = config.shopify;
  const headers: Record<string, string> = {};
  if (storefrontToken) headers['shopify-storefront-private-token'] = storefrontToken;
  return graphql<T>(`https://${storeDomain}/api/${storefrontApiVersion}/graphql.json`, headers, query, options);
}

export function isAdminConfigured(): boolean {
  return Boolean(config.shopify.adminToken);
}

export function adminQuery<T>(query: string, options: RequestOptions = {}): Promise<T> {
  const { storeDomain, adminApiVersion, adminToken } = config.shopify;
  if (!adminToken) {
    throw new ShopifyError('The Shopify Admin API token is not configured.', 'not_configured');
  }
  return graphql<T>(
    `https://${storeDomain}/admin/api/${adminApiVersion}/graphql.json`,
    { 'x-shopify-access-token': adminToken },
    query,
    options,
  );
}

export interface UserError {
  readonly field?: readonly string[] | null;
  readonly message: string;
}

/** Throws when a mutation payload carries `userErrors`. */
export function assertNoUserErrors(errors: readonly UserError[] | null | undefined): void {
  if (errors?.length) {
    throw new ShopifyError(errors[0]!.message, 'user_error', errors.map((error) => error.message));
  }
}

export const toGid = (type: string, id: string): string =>
  id.startsWith('gid://') ? id : `gid://shopify/${type}/${id}`;

export const fromGid = (gid: string): string => gid.split('/').pop()?.split('?')[0] ?? gid;
