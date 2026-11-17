/**
 * Back-office UI primitives.
 *
 * Server components only — no client JavaScript. Forms post to server actions
 * and come back with a flash message, so every screen works without hydration
 * and nothing about an action's result is decided in the browser.
 *
 * The admin has its own neutral palette (true white, near-black, hairlines)
 * rather than the storefront's surface tokens, so a storefront restyle cannot
 * reduce contrast in an operator screen.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';

import type { Money } from '@/domain/types';

export function formatMoney(money: Money | null | undefined): string {
  if (!money) return '—';
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: money.currency }).format(money.amount / 100);
}

export function formatDate(iso: string | null | undefined, withTime = true): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-CA', {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' } : {}),
    timeZone: 'America/Winnipeg',
  }).format(date);
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-black tracking-tight text-neutral-950 uppercase">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm leading-relaxed text-neutral-600">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ title, description, children, id, testId }: { title?: string; description?: ReactNode; children: ReactNode; id?: string; testId?: string }) {
  return (
    <section id={id} data-testid={testId} className="mb-6 border border-neutral-200 bg-white p-4 sm:p-5">
      {title && <h2 className="text-xs font-bold tracking-[0.14em] text-neutral-950 uppercase">{title}</h2>}
      {description && <p className="mt-1 text-sm leading-relaxed text-neutral-600">{description}</p>}
      <div className={title || description ? 'mt-4' : ''}>{children}</div>
    </section>
  );
}

/** Result of the previous action, read from the URL. Announced to screen readers. */
export function Flash({ params }: { params: { ok?: string | string[]; error?: string | string[] } }) {
  const ok = typeof params.ok === 'string' ? params.ok : null;
  const error = typeof params.error === 'string' ? params.error : null;
  if (!ok && !error) return null;
  return (
    <div className="mb-5 flex flex-col gap-2">
      {error && (
        <p role="alert" data-testid="flash-error" className="border border-red-700 bg-red-50 px-4 py-3 text-sm font-medium text-red-900">
          {error}
        </p>
      )}
      {ok && (
        <p role="status" data-testid="flash-ok" className="border border-neutral-900 bg-neutral-950 px-4 py-3 text-sm font-medium text-white">
          {ok}
        </p>
      )}
    </div>
  );
}

const TONES = {
  neutral: 'border-neutral-300 bg-neutral-100 text-neutral-800',
  good: 'border-emerald-700 bg-emerald-50 text-emerald-900',
  warn: 'border-amber-600 bg-amber-50 text-amber-900',
  bad: 'border-red-700 bg-red-50 text-red-900',
  solid: 'border-neutral-950 bg-neutral-950 text-white',
} as const;

export function Badge({ children, tone = 'neutral', testId }: { children: ReactNode; tone?: keyof typeof TONES; testId?: string }) {
  return (
    <span data-testid={testId} className={`inline-block border px-2 py-0.5 text-[0.68rem] font-bold tracking-[0.08em] whitespace-nowrap uppercase ${TONES[tone]}`}>
      {children}
    </span>
  );
}

export const inputClass =
  'block w-full border border-neutral-400 bg-white px-3 py-2 text-sm text-neutral-950 placeholder:text-neutral-400 focus:border-neutral-950 focus:outline-2 focus:outline-offset-1 focus:outline-neutral-950 disabled:bg-neutral-100 disabled:text-neutral-500';

export function Field({
  label,
  name,
  hint,
  children,
  className = '',
}: {
  label: string;
  name: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={name} className="mb-1 block text-xs font-semibold tracking-wide text-neutral-800 uppercase">
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${name}-hint`} className="mt-1 text-xs leading-relaxed text-neutral-600">
          {hint}
        </p>
      )}
    </div>
  );
}

type InputProps = Omit<React.ComponentProps<'input'>, 'className'> & { label: string; name: string; hint?: ReactNode; wrapClass?: string };

export function TextField({ label, name, hint, wrapClass, ...input }: InputProps) {
  return (
    <Field label={label} name={name} hint={hint} className={wrapClass}>
      <input id={name} name={name} aria-describedby={hint ? `${name}-hint` : undefined} className={inputClass} {...input} />
    </Field>
  );
}

type AreaProps = Omit<React.ComponentProps<'textarea'>, 'className'> & { label: string; name: string; hint?: ReactNode; wrapClass?: string };

export function TextArea({ label, name, hint, wrapClass, rows = 4, ...area }: AreaProps) {
  return (
    <Field label={label} name={name} hint={hint} className={wrapClass}>
      <textarea id={name} name={name} rows={rows} aria-describedby={hint ? `${name}-hint` : undefined} className={inputClass} {...area} />
    </Field>
  );
}

type SelectProps = Omit<React.ComponentProps<'select'>, 'className'> & {
  label: string;
  name: string;
  hint?: ReactNode;
  wrapClass?: string;
  options: ReadonlyArray<{ value: string; label: string }>;
};

export function SelectField({ label, name, hint, wrapClass, options, ...select }: SelectProps) {
  return (
    <Field label={label} name={name} hint={hint} className={wrapClass}>
      <select id={name} name={name} aria-describedby={hint ? `${name}-hint` : undefined} className={inputClass} {...select}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function Checkbox({ label, name, hint, ...input }: Omit<React.ComponentProps<'input'>, 'className' | 'type'> & { label: ReactNode; name: string; hint?: ReactNode }) {
  const id = input.id ?? name;
  return (
    <div>
      <label htmlFor={id} className="flex cursor-pointer items-start gap-2 text-sm text-neutral-900">
        <input type="checkbox" name={name} {...input} id={id} className="mt-0.5 size-4 shrink-0 accent-neutral-950" />
        <span>{label}</span>
      </label>
      {hint && <p className="mt-1 pl-6 text-xs leading-relaxed text-neutral-600">{hint}</p>}
    </div>
  );
}

const BUTTONS = {
  primary: 'border-neutral-950 bg-neutral-950 text-white hover:bg-neutral-800',
  secondary: 'border-neutral-950 bg-white text-neutral-950 hover:bg-neutral-100',
  danger: 'border-red-700 bg-white text-red-800 hover:bg-red-50',
} as const;

const buttonBase =
  'inline-flex min-h-10 items-center justify-center border px-4 py-2 text-xs font-bold tracking-[0.1em] uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 disabled:cursor-not-allowed disabled:border-neutral-300 disabled:bg-neutral-100 disabled:text-neutral-500';

export function Button({
  children,
  variant = 'primary',
  testId,
  ...button
}: Omit<React.ComponentProps<'button'>, 'className'> & { variant?: keyof typeof BUTTONS; testId?: string }) {
  return (
    <button type="submit" data-testid={testId} className={`${buttonBase} ${BUTTONS[variant]}`} {...button}>
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  children,
  variant = 'secondary',
  external,
  testId,
}: {
  href: string;
  children: ReactNode;
  variant?: keyof typeof BUTTONS;
  external?: boolean;
  testId?: string;
}) {
  const className = `${buttonBase} ${BUTTONS[variant]}`;
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" data-testid={testId} className={className}>
        {children}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    );
  }
  return (
    <Link href={href} data-testid={testId} className={className}>
      {children}
    </Link>
  );
}

/** A button that cannot act, with the reason shown — never a dead control. */
export function DisabledAction({ label, reason }: { label: string; reason: string }) {
  return (
    <div>
      <button type="button" disabled aria-disabled="true" className={`${buttonBase} ${BUTTONS.secondary}`}>
        {label}
      </button>
      <p className="mt-1 max-w-md text-xs leading-relaxed text-neutral-600">{reason}</p>
    </div>
  );
}

/**
 * Explicit confirmation for a destructive or costly action: the operator types
 * the word. The server action re-checks it; this is not a client-side guard.
 */
export function ConfirmField({ word, name = 'confirm', id }: { word: string; name?: string; id?: string }) {
  const fieldId = id ?? name;
  return (
    <div>
      <label htmlFor={fieldId} className="mb-1 block text-xs font-semibold text-neutral-800">
        Type <span className="font-mono font-bold">{word}</span> to confirm
      </label>
      <input
        id={fieldId}
        name={name}
        required
        autoComplete="off"
        pattern={word}
        title={`Type ${word}`}
        data-testid={`confirm-${fieldId}`}
        className={`${inputClass} max-w-48 font-mono`}
      />
    </div>
  );
}

export function TableWrap({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="overflow-x-auto border border-neutral-200 bg-white" role="region" aria-label={label} tabIndex={0}>
      <table className="w-full min-w-[40rem] border-collapse text-left text-sm">{children}</table>
    </div>
  );
}

export const th = 'border-b border-neutral-300 bg-neutral-50 px-3 py-2 text-[0.68rem] font-bold tracking-[0.1em] text-neutral-700 uppercase whitespace-nowrap';
export const td = 'border-b border-neutral-200 px-3 py-2 align-top text-neutral-900';

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="border border-dashed border-neutral-400 bg-white px-5 py-8 text-center" data-testid="empty-state">
      <p className="text-sm font-bold text-neutral-950 uppercase">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-neutral-600">{children}</div>}
    </div>
  );
}

export function Stat({ label, value, note, testId }: { label: string; value: ReactNode; note?: ReactNode; testId?: string }) {
  return (
    <div className="border border-neutral-200 bg-white p-4" data-testid={testId}>
      <p className="text-[0.68rem] font-bold tracking-[0.12em] text-neutral-600 uppercase">{label}</p>
      <p className="mt-1 text-2xl font-black text-neutral-950 tabular-nums">{value}</p>
      {note && <p className="mt-1 text-xs leading-relaxed text-neutral-600">{note}</p>}
    </div>
  );
}

/** Shown in place of a commerce module when no commerce database is configured. */
export function Disconnected({ module, scopes }: { module: string; scopes: readonly string[] }) {
  return (
    <div className="border border-amber-600 bg-amber-50 p-5" data-testid="disconnected">
      <h2 className="text-sm font-black text-amber-950 uppercase">{module} needs the commerce database</h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-amber-950">
        Products, stock, orders and customers live in INFNITY’s own database, and none is configured for this
        deployment, so nothing is shown here — this dashboard does not invent commerce data. To connect it:
      </p>
      <ol className="mt-3 max-w-3xl list-decimal space-y-1 pl-5 text-sm leading-relaxed text-amber-950">
        {scopes.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-amber-950">
        To learn the dashboard first, run it with <code className="font-mono font-bold">COMMERCE_ADMIN_MODE=sandbox</code>: a
        clearly labelled local sandbox that customers never see.
      </p>
    </div>
  );
}
