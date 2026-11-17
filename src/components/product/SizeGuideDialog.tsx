'use client';

/**
 * Size guide dialog.
 *
 * Shows one of INFNITY's own published charts: the brand's graphic, and the
 * same measurements as a real table so they are readable by a screen reader and
 * at phone width.
 */
import { SizeChartView } from '@/components/product/SizeChartView';
import type { SizeChart } from '@/domain/size-charts';
import { useFocusTrap } from '@/lib/useFocusTrap';

export function SizeGuideDialog({
  chart,
  isOpen,
  onClose,
}: {
  chart: SizeChart;
  isOpen: boolean;
  onClose: () => void;
}) {
  const containerRef = useFocusTrap(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Close size guide"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/45"
        tabIndex={-1}
      />

      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="size-guide-title"
        data-testid="size-guide-dialog"
        tabIndex={-1}
        data-surface="paper"
        className="bg-surface text-fg relative flex max-h-[90svh] w-full max-w-2xl flex-col"
      >
        <div className="border-line flex shrink-0 items-center justify-between border-b px-5 py-2">
          <h2 id="size-guide-title" className="text-xs font-semibold tracking-[0.18em] uppercase">
            Size guide — {chart.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close size guide"
            className="text-fg -mr-2.5 grid h-11 w-11 place-items-center"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path d="m4 4 12 12M16 4 4 16" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <SizeChartView chart={chart} />
        </div>
      </div>
    </div>
  );
}
