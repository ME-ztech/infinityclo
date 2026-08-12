import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

/**
 * The shared empty state.
 *
 * Used wherever a surface has nothing to show — no search results, no filter
 * matches, an empty bag, a catalogue that has not been imported. It is
 * deliberately plain and never apologises with fake content or placeholder
 * cards; it says what is missing and offers the nearest useful action.
 *
 * Surface-relative, so the same component reads correctly in a white showroom
 * and in the black Vault without a variant per room.
 */
export function EmptyState({
  title,
  body,
  action,
  className,
}: {
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-testid="empty-state"
      className={cn(
        'border-line flex flex-col items-center justify-center border px-6 py-20 text-center md:py-28',
        className,
      )}
    >
      <span aria-hidden className="bg-signal mb-7 h-px w-10" />
      <p className="font-display text-fg text-2xl text-balance md:text-3xl">{title}</p>
      {body && <div className="text-fg-muted mt-4 max-w-md text-sm leading-relaxed">{body}</div>}
      {action && <div className="mt-8">{action}</div>}
    </div>
  );
}
