/**
 * Shared guard for the public forms (newsletter, waitlist, contact, community).
 *
 * Each of them is an anonymous write endpoint, which makes them the obvious
 * target for spam and abuse. Every request therefore passes, in order:
 *
 *   1. a same-origin check, so another site cannot post on a visitor's behalf;
 *   2. a per-address rate limit;
 *   3. a honeypot: `website` is a field no person can see. A bot that fills it
 *      in gets the same friendly success as everyone else and nothing is stored,
 *      so it learns nothing about why it failed.
 *
 * Errors are deliberately generic and never echo what was submitted.
 */
import 'server-only';

import { NextResponse } from 'next/server';

import { clientAddress, isSameOrigin, rateLimit } from '../security';

export const json = (body: Record<string, unknown>, status = 200, headers: Record<string, string> = {}): NextResponse =>
  NextResponse.json(body, { status, headers: { 'cache-control': 'no-store', ...headers } });

export type GuardResult = { readonly refused: NextResponse } | { readonly refused: null };

export function guardPublicForm(request: Request, scope: string, limit: number, windowSeconds = 600): GuardResult {
  if (!isSameOrigin(request)) return { refused: json({ error: 'Cross-site request refused.' }, 403) };
  const result = rateLimit(scope, clientAddress(request), limit, windowSeconds);
  if (!result.allowed) {
    return {
      refused: json({ error: 'Too many attempts. Please try again later.' }, 429, {
        'retry-after': String(result.retryAfterSeconds),
      }),
    };
  }
  return { refused: null };
}

/** Parses a JSON object body, or returns null for anything else. */
export async function readJsonObject(request: Request, maxBytes = 20_000): Promise<Record<string, unknown> | null> {
  try {
    const text = await request.text();
    if (text.length > maxBytes) return null;
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** True when the hidden honeypot field was filled in. */
export const isHoneypotTripped = (value: unknown): boolean => typeof value === 'string' && value.trim() !== '';

/** Consent must be given explicitly: `true`, or the form value "yes". Anything else is no. */
export const hasConsent = (value: unknown): boolean => value === true || value === 'yes';
