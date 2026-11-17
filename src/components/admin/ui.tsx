import Link from 'next/link';

import { cn } from '@/lib/cn';

export const inputClass = 'border-line focus:border-ink h-10 w-full border bg-white px-3 text-sm outline-none disabled:bg-neutral-100 disabled:text-neutral-500';
export const textareaClass = 'border-line focus:border-ink w-full border bg-white px-3 py-2 text-sm outline-none';

export function AdminPage({ title, description, actions, children }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {description && <p className="mt-1 max-w-3xl text-sm text-neutral-600">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </header>
      {children}
    </div>
  );
}

export function Card({ title, children, className, actions }: { title?: string; children: React.ReactNode; className?: string; actions?: React.ReactNode }) {
  return (
    <section className={cn('border-line border bg-white p-5', className)}>
      {(title || actions) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-sm font-semibold tracking-wide uppercase">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, href }: { label: string; value: React.ReactNode; hint?: string; href?: string }) {
  const body = (
    <>
      <p className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-neutral-500">{hint}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="border-line block border bg-white p-4 hover:border-neutral-400">
      {body}
    </Link>
  ) : (
    <div className="border-line border bg-white p-4">{body}</div>
  );
}

const BADGE_TONES = {
  neutral: 'bg-neutral-100 text-neutral-700',
  good: 'bg-green-100 text-green-800',
  warn: 'bg-amber-100 text-amber-900',
  bad: 'bg-red-100 text-red-800',
  info: 'bg-blue-100 text-blue-800',
} as const;

export function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: keyof typeof BADGE_TONES }) {
  return <span className={cn('inline-flex items-center px-2 py-0.5 text-[0.7rem] font-semibold uppercase', BADGE_TONES[tone])}>{children}</span>;
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: React.ReactNode; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-xs font-semibold text-neutral-700">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-neutral-500">{hint}</p>}
    </div>
  );
}

/** States exactly what is missing for a Shopify-backed module, instead of showing fake data. */
export function NotConnected({ what, envVar, scopes }: { what: string; envVar: string; scopes?: string }) {
  return (
    <div className="border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" data-testid="not-connected">
      <p className="font-semibold">{what} needs the Shopify Admin API.</p>
      <p className="mt-1">
        Set <code className="bg-white px-1">{envVar}</code>
        {scopes ? (
          <>
            {' '}
            with scopes <code className="bg-white px-1">{scopes}</code>
          </>
        ) : null}
        . Until then this screen shows the imported catalogue read-only and every write is disabled — nothing here pretends to change your store. See
        Settings → Integrations.
      </p>
    </div>
  );
}

export function Table({ head, children, empty }: { head: React.ReactNode[]; children: React.ReactNode; empty?: string }) {
  return (
    <div className="border-line overflow-x-auto border bg-white">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-line border-b bg-neutral-50">
          <tr>
            {head.map((cell, index) => (
              <th key={index} scope="col" className="px-3 py-2 text-xs font-semibold tracking-wide text-neutral-600 uppercase">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-line divide-y">{children}</tbody>
      </table>
      {empty && <p className="p-4 text-sm text-neutral-500">{empty}</p>}
    </div>
  );
}

export function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn('px-3 py-2 align-top', className)}>{children}</td>;
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Winnipeg' });
}

export function formatCad(amount: string | number | null | undefined, currency = 'CAD'): string {
  if (amount === null || amount === undefined || amount === '') return '—';
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency }).format(Number(amount));
}
