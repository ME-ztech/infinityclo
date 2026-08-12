import Link from 'next/link';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { cn } from '@/lib/cn';

/**
 * Buttons are surface-relative.
 *
 * `primary` resolves to the *inverse* of whichever room it is standing in —
 * black on bone, white on void — so the same component is the strongest control
 * on the page in every section without a variant per surface. That is the whole
 * reason the semantic token layer exists.
 *
 * `signal` is the red one, and it is deliberately not the default. Red is
 * reserved for the moments where urgency is real: a sale CTA, a cart
 * confirmation. Making it the house button turns the storefront into a
 * red-and-black gaming site, which is precisely what 1.1 is moving away from.
 *
 * Every size clears a 44px touch target at `md` and above; `sm` is for desktop
 * chrome only.
 */
type Variant = 'primary' | 'secondary' | 'signal' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-inverse-surface text-inverse-fg hover:opacity-85 disabled:bg-line disabled:text-fg-faint disabled:opacity-100',
  secondary:
    'border border-fg/25 bg-transparent text-fg hover:border-fg hover:bg-fg/[0.04] disabled:border-line disabled:text-fg-faint',
  signal: 'bg-signal text-paper hover:bg-signal-deep disabled:bg-line disabled:text-fg-faint',
  ghost: 'bg-transparent text-fg-muted hover:text-fg underline-offset-4 hover:underline',
};

const SIZES: Record<Size, string> = {
  sm: 'h-10 px-4 text-[0.68rem] tracking-[0.16em]',
  md: 'h-12 px-6 text-[0.72rem] tracking-[0.18em]',
  lg: 'h-14 px-9 text-[0.78rem] tracking-[0.2em]',
};

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-(--radius-control) font-semibold uppercase ' +
  'transition-[background-color,border-color,color,opacity] duration-200 ease-(--ease-brand) ' +
  'disabled:cursor-not-allowed select-none';

interface CommonProps {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  children: ReactNode;
  className?: string;
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth,
  className,
  children,
  ...props
}: CommonProps & ComponentPropsWithoutRef<'button'>) {
  return (
    <button
      className={cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className)}
      {...props}
    >
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  fullWidth,
  className,
  children,
  href,
  ...props
}: CommonProps & { href: string } & Omit<ComponentPropsWithoutRef<typeof Link>, 'href'>) {
  return (
    <Link
      href={href}
      className={cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className)}
      {...props}
    >
      {children}
    </Link>
  );
}

/**
 * The editorial "more" link — a rule that draws itself under the label on
 * hover. Used instead of a button wherever a section already has a primary
 * action and a second filled control would compete with it.
 */
export function TextLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'group text-fg inline-flex items-center gap-2 text-[0.7rem] font-semibold tracking-[0.2em] uppercase',
        className,
      )}
    >
      <span className="relative">
        {children}
        <span
          aria-hidden
          className="bg-fg absolute -bottom-1 left-0 h-px w-full origin-left scale-x-100 transition-transform duration-300 ease-(--ease-brand) group-hover:scale-x-0"
        />
        <span
          aria-hidden
          className="bg-signal absolute -bottom-1 left-0 h-px w-full origin-left scale-x-0 transition-transform duration-300 ease-(--ease-brand) group-hover:scale-x-100"
        />
      </span>
      <span
        aria-hidden
        className="transition-transform duration-300 ease-(--ease-brand) group-hover:translate-x-1"
      >
        →
      </span>
    </Link>
  );
}
