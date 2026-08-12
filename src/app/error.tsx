'use client';

/**
 * Route error boundary. Shows a branded surface and a retry rather than a
 * framework stack trace. The digest is surfaced because it is the only thing
 * that makes a production report actionable.
 */
import { useEffect } from 'react';

import { Button, ButtonLink } from '@/components/ui/Button';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Route error:', error);
  }, [error]);

  return (
    <div className="edge flex min-h-[70svh] flex-col items-center justify-center pt-28 pb-[--spacing-section] text-center">
      <p className="font-display text-headline text-paper">Something broke</p>
      <p className="text-smoke mt-5 max-w-sm text-sm leading-relaxed">
        This page failed to load. Try again — if it keeps happening, the rest of the store still
        works.
      </p>

      {error.digest && (
        <p className="text-dim mt-4 text-[0.7rem] tracking-[0.1em]">Reference: {error.digest}</p>
      )}

      <div className="mt-9 flex flex-wrap justify-center gap-3">
        <Button variant="primary" size="lg" onClick={reset}>
          Try again
        </Button>
        <ButtonLink href="/" variant="secondary" size="lg">
          Home
        </ButtonLink>
      </div>
    </div>
  );
}
