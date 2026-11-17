'use client';

import { useState } from 'react';

import { useStoreConfig } from '@/lib/store-config';

/**
 * Shown only while checkout is not connected, so nobody mistakes the preview
 * for a store that can take an order. Disappears automatically once checkout
 * hands off to Shopify.
 */
export function PreviewNotice() {
  const { checkoutMode } = useStoreConfig();
  const [isDismissed, setIsDismissed] = useState(false);

  if (checkoutMode !== 'disabled' || isDismissed) return null;

  return (
    <div
      role="status"
      data-testid="preview-notice"
      data-surface="ink"
      className="bg-surface text-fg px-4 py-2 text-center text-[0.66rem] leading-snug font-semibold tracking-[0.12em] uppercase"
    >
      <span>Preview — checkout is not connected, so no orders can be placed.</span>
      <button
        type="button"
        onClick={() => setIsDismissed(true)}
        aria-label="Dismiss preview notice"
        className="ml-3 underline underline-offset-2"
      >
        Dismiss
      </button>
    </div>
  );
}
