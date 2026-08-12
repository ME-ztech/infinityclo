'use client';

/**
 * Size guide.
 *
 * Renders whatever measurements the brand has confirmed and marks the rest as
 * pending. A garment measurement is something a customer orders against, so an
 * unconfirmed value shows as "—" with an explicit notice rather than a number
 * that looks authoritative and is not.
 */
import type { SizeGuide } from '@/domain/types';
import { useFocusTrap } from '@/lib/useFocusTrap';

export function SizeGuideDialog({
  guide,
  isOpen,
  onClose,
}: {
  guide: SizeGuide;
  isOpen: boolean;
  onClose: () => void;
}) {
  const containerRef = useFocusTrap(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close size guide"
        onClick={onClose}
        className="bg-void/80 absolute inset-0 h-full w-full cursor-default"
        tabIndex={-1}
      />

      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="size-guide-title"
        tabIndex={-1}
        className="bg-ink border-ash relative flex max-h-[85svh] w-full max-w-2xl flex-col border"
      >
        <div className="border-ash/50 flex shrink-0 items-center justify-between border-b px-6 py-4">
          <h2 id="size-guide-title" className="text-xs font-semibold tracking-[0.18em] uppercase">
            {guide.name}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close size guide"
            className="text-bone hover:text-paper -mr-2 p-2"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path d="m4 4 12 12M16 4 4 16" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {guide.isPending && (
            <p className="border-ash text-smoke mb-6 border px-4 py-3 text-xs leading-relaxed">
              Measurements for this piece have not been confirmed yet. The rows below are shown so
              you can see what will be published — no estimated numbers have been filled in.
            </p>
          )}

          {/* Table scrolls inside its own container so the page never scrolls
              sideways on a phone. */}
          <div className="-mx-2 overflow-x-auto px-2">
            <table className="w-full min-w-[420px] border-collapse text-sm">
              <caption className="sr-only">Garment measurements by size for {guide.name}</caption>
              <thead>
                <tr className="border-ash border-b">
                  <th
                    scope="col"
                    className="text-dim py-3 pr-4 text-left text-[0.68rem] tracking-[0.16em] uppercase"
                  >
                    Measurement
                  </th>
                  {guide.sizes.map((size) => (
                    <th
                      key={size}
                      scope="col"
                      className="text-dim px-3 py-3 text-center text-[0.68rem] tracking-[0.16em] uppercase"
                    >
                      {size}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {guide.rows.map((row) => (
                  <tr key={row.label} className="border-ash/40 border-b">
                    <th scope="row" className="text-bone py-3 pr-4 text-left font-normal">
                      {row.label}
                      <span className="text-dim ml-1 text-xs">({row.unit})</span>
                    </th>
                    {guide.sizes.map((size) => {
                      const measurement = row.measurements.find((m) => m.size === size);
                      return (
                        <td key={size} className="text-bone px-3 py-3 text-center tabular-nums">
                          {measurement?.value ?? <span className="text-dim">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {guide.notes && <p className="text-smoke mt-6 text-xs leading-relaxed">{guide.notes}</p>}
        </div>
      </div>
    </div>
  );
}
