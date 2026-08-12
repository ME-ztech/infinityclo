'use client';

/**
 * The Troop gallery.
 *
 * A masonry-ish editorial grid of real customer fits. Entries that map to
 * products become shoppable — tapping opens a lightbox listing the pieces in
 * the shot — which is what keeps this a commerce surface rather than a feed.
 *
 * Attribution is shown only where the handle is publicly credited in the source
 * data; no handle is inferred or invented.
 */
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

import type { UGCEntry } from '@/domain/types';
import { track } from '@/lib/analytics';
import { cn } from '@/lib/cn';
import { useFocusTrap } from '@/lib/useFocusTrap';

export function TroopGallery({
  entries,
  className,
}: {
  entries: readonly UGCEntry[];
  className?: string;
}) {
  const [openEntry, setOpenEntry] = useState<UGCEntry | null>(null);

  return (
    <>
      {/* CSS columns give the staggered editorial rhythm without measuring
          anything in JS, so there is no layout shift on load. */}
      <div className={cn('columns-2 gap-4 md:columns-3 lg:columns-4', className)}>
        {entries.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => {
              setOpenEntry(entry);
              track({ name: 'ugc_opened', entryId: entry.id });
            }}
            data-testid="troop-entry"
            className="group bg-surface-sunken relative mb-4 block w-full break-inside-avoid overflow-hidden text-left"
          >
            <Image
              src={entry.media.url}
              alt={entry.media.alt}
              width={entry.media.width || 800}
              height={entry.media.height || 1000}
              sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
              className="w-full transition-transform duration-700 ease-(--ease-brand) group-hover:scale-[1.04]"
            />

            <div
              aria-hidden
              className="from-void/80 absolute inset-0 bg-gradient-to-t via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            />

            {entry.handle && (
              <span className="text-fg absolute bottom-3 left-3 text-[0.7rem] font-semibold tracking-[0.1em] opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                {entry.handle}
              </span>
            )}

            {entry.productSlugs.length > 0 && (
              <span className="bg-inverse-surface text-inverse-fg absolute top-3 right-3 px-2 py-1 text-[0.58rem] font-bold tracking-[0.14em] uppercase">
                Shop
              </span>
            )}
          </button>
        ))}
      </div>

      {openEntry && <TroopLightbox entry={openEntry} onClose={() => setOpenEntry(null)} />}
    </>
  );
}

function TroopLightbox({ entry, onClose }: { entry: UGCEntry; onClose: () => void }) {
  const containerRef = useFocusTrap(true, onClose);

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="bg-surface/85 absolute inset-0 h-full w-full cursor-default"
        tabIndex={-1}
      />

      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Customer fit"
        tabIndex={-1}
        className="bg-surface-raised border-line relative flex max-h-[90svh] w-full max-w-3xl flex-col overflow-hidden border md:flex-row"
      >
        <div className="relative min-h-[45svh] flex-1 md:min-h-0">
          <Image
            src={entry.media.url}
            alt={entry.media.alt}
            fill
            sizes="(min-width: 768px) 50vw, 100vw"
            className="object-cover"
          />
        </div>

        <div className="flex w-full shrink-0 flex-col gap-5 overflow-y-auto p-6 md:w-72">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-fg-faint text-[0.68rem] font-semibold tracking-[0.2em] uppercase">
                The Troop
              </p>
              {entry.handle && <p className="text-fg mt-1 text-sm">{entry.handle}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="text-fg-muted hover:text-fg -mt-2 -mr-2 p-2"
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
                <path d="m4 4 12 12M16 4 4 16" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
          </div>

          {entry.caption && (
            <p className="text-fg-muted text-sm leading-relaxed">{entry.caption}</p>
          )}

          {entry.productSlugs.length > 0 && (
            <div>
              <p className="text-fg-faint mb-3 text-[0.68rem] font-semibold tracking-[0.2em] uppercase">
                In this fit
              </p>
              <ul className="flex flex-col gap-2">
                {entry.productSlugs.map((slug) => (
                  <li key={slug}>
                    <Link
                      href={`/products/${slug}`}
                      onClick={onClose}
                      className="text-fg-muted hover:text-fg text-sm underline underline-offset-4"
                    >
                      {slug.replace(/-/g, ' ')}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
