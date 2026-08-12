import type { ElementType, ReactNode } from 'react';

import { cn } from '@/lib/cn';

/**
 * A room.
 *
 * The homepage is composed of these, and the whole contrast strategy of 1.1
 * lives here: a section declares which material it is made of, and everything
 * inside it re-tones off the `[data-surface]` token layer in globals.css. No
 * component below this point needs to know whether it is on bone or on void.
 *
 * `bleed` exists because the two are genuinely different compositions: a
 * showroom section keeps the page gutter so products align to the grid, while a
 * campaign section runs to the edge of the glass. Making that a prop rather than
 * two components keeps the homepage readable as a sequence of rooms.
 */
export type Surface = 'paper' | 'bone' | 'concrete' | 'ink' | 'void';

interface SectionProps {
  surface: Surface;
  children: ReactNode;
  /** Vertical rhythm. `none` is for sections that own their own padding. */
  spacing?: 'none' | 'tight' | 'default' | 'loose';
  /** Skip the horizontal gutter so content can run edge to edge. */
  bleed?: boolean;
  as?: ElementType;
  id?: string;
  className?: string;
  'aria-labelledby'?: string;
  'aria-label'?: string;
}

const SPACING = {
  none: '',
  tight: 'py-[clamp(3rem,7vw,5.5rem)]',
  default: 'py-(--spacing-section)',
  loose: 'py-[clamp(6rem,14vw,13rem)]',
} as const;

export function Section({
  surface,
  children,
  spacing = 'default',
  bleed = false,
  as: Tag = 'section',
  id,
  className,
  ...aria
}: SectionProps) {
  return (
    <Tag
      id={id}
      data-surface={surface}
      className={cn('bg-surface text-fg relative', SPACING[spacing], !bleed && 'edge', className)}
      {...aria}
    >
      {children}
    </Tag>
  );
}

/**
 * Section header used across the homepage and catalogue.
 *
 * The "view all" link is hidden below `sm` and replaced by a full-width link
 * under the content, because on a 390px phone a right-aligned link next to a
 * display heading either wraps into it or shrinks the heading.
 */
export function SectionHeader({
  eyebrow,
  title,
  id,
  lede,
  action,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  id?: string;
  lede?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-x-8 gap-y-4', className)}>
      <div className="max-w-2xl">
        {eyebrow && (
          <p className="text-fg-faint mb-3 text-[0.66rem] font-semibold tracking-[0.28em] uppercase">
            {eyebrow}
          </p>
        )}
        <h2 id={id} className="font-display text-headline text-fg text-balance">
          {title}
        </h2>
        {lede && <p className="text-fg-muted mt-4 max-w-md text-sm leading-relaxed">{lede}</p>}
      </div>
      {action && <div className="shrink-0 pb-1">{action}</div>}
    </div>
  );
}
