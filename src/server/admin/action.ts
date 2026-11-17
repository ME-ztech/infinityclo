/**
 * The wrapper every admin server action runs inside.
 *
 * A server action is a public HTTP endpoint, whatever the UI shows or hides.
 * So each one goes through the same sequence, in this order:
 *
 *   1. same-origin check            (refuse cross-site posts)
 *   2. `requirePermission`          (session + role, re-read from storage)
 *   3. the work itself              (validates its own input)
 *   4. an audit entry               (ok / denied / failed)
 *   5. redirect with a flash message
 *
 * Nothing in step 3 runs unless 1 and 2 passed.
 */
import 'server-only';

import { redirect } from 'next/navigation';

import { audit } from '../audit';

import { AdminAuthError, assertSameOrigin, getSession, requirePermission, type AdminSession } from './auth';
import { gatewayMode, getGateway, type CommerceGateway } from './gateway';
import type { Permission } from './permissions';

export interface ActionOutcome {
  /** Where to send the operator. Defaults to the `back` path. */
  readonly to?: string;
  readonly message: string;
  /** Audit target, e.g. `product:123`. */
  readonly target?: string;
  /** Audit detail. Identifiers and masked values only — never secrets or full PII. */
  readonly detail?: string;
}

export interface ActionContext {
  readonly session: AdminSession;
  /** Null when no commerce backend is connected. */
  readonly gateway: CommerceGateway | null;
}

export function withFlash(path: string, kind: 'ok' | 'error', message: string): string {
  const [base = '', hash = ''] = path.split('#');
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}${kind}=${encodeURIComponent(message.slice(0, 300))}${hash ? `#${hash}` : ''}`;
}

/** Only same-site admin paths are valid redirect targets. */
export function safeAdminPath(path: unknown, fallback = '/admin'): string {
  return typeof path === 'string' && /^\/admin(?:[/?#][^\s]*)?$/.test(path) && !path.includes('//') ? path : fallback;
}

export async function runAction(
  options: { permission: Permission; action: string; back: string; commerce?: boolean; target?: string },
  work: (context: ActionContext) => Promise<ActionOutcome>,
): Promise<never> {
  const back = safeAdminPath(options.back);
  const mode = options.commerce ? (gatewayMode() === 'shopify' ? 'shopify' : 'sandbox') : 'local';
  let destination: string;

  let session: AdminSession;
  try {
    await assertSameOrigin();
    session = await requirePermission(options.permission, options.target ?? options.action);
  } catch (error) {
    if (error instanceof AdminAuthError) {
      if (error.reason === 'unauthenticated') redirect('/admin/login');
      if (error.reason === 'cross_site') {
        const current = await getSession().catch(() => null);
        await audit({
          actor: current?.email ?? 'unknown',
          role: current?.role ?? 'none',
          action: options.action,
          target: options.target ?? '',
          outcome: 'denied',
          detail: 'Cross-site request refused.',
          mode,
        });
      }
      redirect(withFlash(back, 'error', error.message));
    }
    throw error;
  }

  try {
    const gateway = options.commerce ? await getGateway() : null;
    const outcome = await work({ session, gateway });
    await audit({
      actor: session.email,
      role: session.role,
      action: options.action,
      target: outcome.target ?? options.target ?? '',
      outcome: 'ok',
      detail: outcome.detail ?? outcome.message,
      mode,
    });
    destination = withFlash(safeAdminPath(outcome.to, back), 'ok', outcome.message);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Something went wrong.';
    const denied = error instanceof AdminAuthError;
    await audit({
      actor: session.email,
      role: session.role,
      action: options.action,
      target: options.target ?? '',
      outcome: denied ? 'denied' : 'failed',
      detail: message,
      mode,
    });
    destination = withFlash(back, 'error', message);
  }
  redirect(destination);
}

/* ------------------------------------------------------------------ *
 * Form reading
 * ------------------------------------------------------------------ */

/** Trimmed, length-capped, control characters removed. */
export function field(form: FormData, name: string, max = 500): string {
  const value = form.get(name);
  if (typeof value !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}

export const checked = (form: FormData, name: string): boolean => form.get(name) === 'on' || form.get(name) === 'true';

export function integer(form: FormData, name: string): number | null {
  const raw = field(form, name, 20);
  if (!/^-?\d+$/.test(raw)) return null;
  return Number(raw);
}

/** `"45"` / `"45.5"` / `"45.50"` -> cents. Null for empty or malformed input. */
export function priceCents(form: FormData, name: string): number | null {
  const raw = field(form, name, 20).replace(/^\$/, '');
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(raw)) return null;
  return Math.round(Number(raw) * 100);
}

export const list = (value: string, max = 50): string[] =>
  [...new Set(value.split(',').map((entry) => entry.trim()).filter(Boolean))].slice(0, max);

/** `datetime-local` value -> ISO string, or null. */
export function dateTime(form: FormData, name: string): string | null {
  const raw = field(form, name, 40);
  if (!raw) return null;
  const time = Date.parse(raw);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}
