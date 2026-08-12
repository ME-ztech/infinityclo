import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

/**
 * The shared empty state.
 *
 * Used wherever a surface has nothing to show — no search results, no filter
 * matches, an empty cart, or a catalog that has not been imported yet. It is
 * deliberately plain and never apologises with fake content or placeholder
 * cards; it says what is missing and offers the nearest useful action.
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
        'border-ash/50 flex flex-col items-center justify-center border px-6 py-20 text-center',
        className,
      )}
    >
      <p className="font-display text-paper text-2xl md:text-3xl">{title}</p>
      {body && <div className="text-smoke mt-3 max-w-md text-sm leading-relaxed">{body}</div>}
      {action && <div className="mt-7">{action}</div>}
    </div>
  );
}
