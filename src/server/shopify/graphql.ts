import 'server-only';

/**
 * Minimal, dependency-free GraphQL transport for Shopify's APIs.
 *
 * - Retries transient failures (network, 429, 5xx) and Admin API `THROTTLED`
 *   errors with exponential backoff, honouring `Retry-After`.
 * - Surfaces GraphQL `errors` and mutation `userErrors` as typed exceptions so
 *   callers never mistake a rejected write for a success.
 * - Never logs tokens or response bodies containing customer data.
 */

export class ShopifyApiError extends Error {
  constructor(
    message: string,
    public readonly kind: 'network' | 'http' | 'graphql' | 'throttled' | 'user' | 'not_configured',
    public readonly status?: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ShopifyApiError';
  }
}

export interface GraphqlRequest {
  readonly endpoint: string;
  readonly headers: Record<string, string>;
  readonly query: string;
  readonly variables?: Record<string, unknown>;
  readonly maxAttempts?: number;
  readonly timeoutMs?: number;
}

interface GraphqlResponse<T> {
  data?: T;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
  extensions?: { cost?: { throttleStatus?: { currentlyAvailable: number; restoreRate: number } } };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Exposed for tests; production uses the global fetch. */
export const transport: { fetch: typeof fetch } = { fetch: (...args) => fetch(...args) };

export async function shopifyGraphql<T>(request: GraphqlRequest): Promise<T> {
  const maxAttempts = request.maxAttempts ?? 4;
  let lastError: ShopifyApiError | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response: Response;
    try {
      response = await transport.fetch(request.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          ...request.headers,
        },
        body: JSON.stringify({ query: request.query, variables: request.variables ?? {} }),
        signal: AbortSignal.timeout(request.timeoutMs ?? 15_000),
        cache: 'no-store',
      });
    } catch (error) {
      lastError = new ShopifyApiError(
        `Shopify is unreachable: ${(error as Error).message}`,
        'network',
      );
      await sleep(backoff(attempt));
      continue;
    }

    if (response.status === 429 || response.status >= 500) {
      lastError = new ShopifyApiError(
        `Shopify responded ${response.status}`,
        response.status === 429 ? 'throttled' : 'http',
        response.status,
      );
      const retryAfter = Number(response.headers.get('retry-after'));
      await sleep(
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoff(attempt),
      );
      continue;
    }

    if (!response.ok) {
      // 401/403/404 are configuration problems; retrying will not help.
      throw new ShopifyApiError(
        response.status === 401 || response.status === 403
          ? 'Shopify rejected the credentials (check the token and its scopes).'
          : `Shopify responded ${response.status}`,
        'http',
        response.status,
      );
    }

    const body = (await response.json()) as GraphqlResponse<T>;
    if (body.errors?.length) {
      const throttled = body.errors.some((error) => error.extensions?.code === 'THROTTLED');
      if (throttled) {
        lastError = new ShopifyApiError('Shopify Admin API throttled the request', 'throttled');
        const status = body.extensions?.cost?.throttleStatus;
        await sleep(
          status
            ? Math.min(10_000, (1000 * 100) / Math.max(1, status.restoreRate))
            : backoff(attempt),
        );
        continue;
      }
      throw new ShopifyApiError(
        body.errors.map((error) => error.message).join('; '),
        'graphql',
        200,
        body.errors,
      );
    }
    if (!body.data) throw new ShopifyApiError('Shopify returned no data', 'graphql');
    return body.data;
  }

  throw lastError ?? new ShopifyApiError('Shopify request failed', 'network');
}

function backoff(attempt: number): number {
  return Math.min(8000, 250 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 100);
}

export interface UserError {
  readonly field?: readonly string[] | null;
  readonly message: string;
  readonly code?: string | null;
}

/** Throws when a mutation payload carries userErrors — a rejected write is never a success. */
export function assertNoUserErrors(
  payload: { userErrors?: readonly UserError[] | null } | null | undefined,
  action: string,
): void {
  const errors = payload?.userErrors ?? [];
  if (errors.length > 0) {
    throw new ShopifyApiError(
      `${action} was rejected by Shopify: ${errors.map((error) => error.message).join('; ')}`,
      'user',
      200,
      errors,
    );
  }
}

/** `gid://shopify/ProductVariant/123` → `123`. Leaves non-gids untouched. */
export function legacyId(gid: string): string {
  const match = /^gid:\/\/shopify\/[A-Za-z]+\/(\d+)/.exec(gid);
  return match ? match[1]! : gid;
}

export function toGid(type: string, id: string): string {
  return id.startsWith('gid://') ? id : `gid://shopify/${type}/${id}`;
}
