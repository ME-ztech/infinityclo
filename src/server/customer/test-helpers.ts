/**
 * Request builders for route-handler tests. Not imported by application code.
 */
const HOST = 'shop.test';
export const TEST_ORIGIN = `https://${HOST}`;

let addressCounter = 0;

/** A fresh client address, so one test's rate-limit bucket never affects another. */
export const uniqueAddress = (): string => `10.0.${Math.floor(addressCounter / 250)}.${(addressCounter++ % 250) + 1}`;

export interface RequestOptions {
  readonly origin?: string | null;
  readonly address?: string;
  readonly headers?: Record<string, string>;
}

function baseHeaders({ origin = TEST_ORIGIN, address, headers }: RequestOptions): Headers {
  const result = new Headers({ host: HOST, 'x-forwarded-proto': 'https', 'x-forwarded-for': address ?? uniqueAddress(), ...headers });
  if (origin) result.set('origin', origin);
  return result;
}

export function jsonRequest(path: string, body: unknown, options: RequestOptions = {}): Request {
  const headers = baseHeaders(options);
  headers.set('content-type', 'application/json');
  return new Request(`${TEST_ORIGIN}${path}`, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });
}

export function formRequest(path: string, form: FormData, options: RequestOptions = {}): Request {
  return new Request(`${TEST_ORIGIN}${path}`, { method: 'POST', headers: baseHeaders(options), body: form });
}
