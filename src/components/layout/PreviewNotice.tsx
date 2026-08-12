'use client';

/**
 * Preview banner.
 *
 * The deployed storefront has no payment infrastructure. This states that
 * plainly and permanently while `CHECKOUT_ENABLED` is false, so nobody can
 * mistake the preview for a shop that takes orders. It is dismissible per
 * session for reviewing the design, but it returns on the next visit — a
 * one-time dismissal that silences a disclosure this important would defeat it.
 */
import { useEffect, useState } from 'react';

import { CHECKOUT_ENABLED } from '@/lib/site';

const DISMISS_KEY = 'infnity.preview-notice.dismissed';

export function PreviewNotice() {
  const [isDismissed, setIsDismissed] = useState(true);

  useEffect(() => {
    if (CHECKOUT_ENABLED) return;
    setIsDismissed(window.sessionStorage.getItem(DISMISS_KEY) === '1');
  }, []);

  if (CHECKOUT_ENABLED || isDismissed) return null;

  return (
    <div
      role="status"
      data-testid="preview-notice"
      className="bg-paper text-void relative z-[60] px-4 py-2 text-center text-[0.7rem] leading-snug font-semibold tracking-[0.1em] uppercase"
    >
      <span>Preview build — checkout is not live and no orders can be placed.</span>
      <button
        type="button"
        onClick={() => {
          window.sessionStorage.setItem(DISMISS_KEY, '1');
          setIsDismissed(true);
        }}
        aria-label="Dismiss preview notice"
        className="ml-3 underline underline-offset-2"
      >
        Dismiss
      </button>
    </div>
  );
}
