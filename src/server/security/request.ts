import 'server-only';

import { headers } from 'next/headers';

import { hashIp } from './crypto';

export interface RequestContext {
  readonly ip: string | null;
  readonly ipHash: string | null;
  readonly userAgent: string | null;
  readonly isHttps: boolean;
  readonly origin: string | null;
  readonly host: string | null;
}

export function contextFromHeaders(h: Headers): RequestContext {
  const forwarded = h.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
  const ip = forwarded ?? h.get('x-real-ip') ?? null;
  const proto = h.get('x-forwarded-proto') ?? (h.get('host')?.startsWith('localhost') ? 'http' : null);
  return {
    ip,
    ipHash: hashIp(ip),
    userAgent: h.get('user-agent')?.slice(0, 300) ?? null,
    isHttps: proto === 'https',
    origin: h.get('origin'),
    host: h.get('x-forwarded-host') ?? h.get('host'),
  };
}

export async function requestContext(): Promise<RequestContext> {
  return contextFromHeaders(await headers());
}

/**
 * Same-origin check for JSON route handlers that change state. Server Actions
 * already get this from Next.js; route handlers called with `fetch` from our own
 * pages must present an Origin matching the Host.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
