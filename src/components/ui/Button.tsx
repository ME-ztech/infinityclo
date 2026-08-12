import Link from 'next/link';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'inverse';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-paper text-void hover:bg-bone disabled:bg-ash disabled:text-dim',
  secondary: 'border border-ash bg-transparent text-bone hover:border-bone hover:bg-carbon',
  ghost: 'bg-transparent text-bone hover:text-paper underline-offset-4 hover:underline',
  inverse: 'bg-void text-paper hover:bg-carbon',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-4 text-[0.7rem] tracking-[0.14em]',
  md: 'h-12 px-6 text-xs tracking-[0.16em]',
  lg: 'h-14 px-8 text-sm tracking-[0.18em]',
};

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-[--radius-control] font-semibold uppercase ' +
  'transition-colors duration-200 ease-[--ease-brand] disabled:cursor-not-allowed select-none';

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
