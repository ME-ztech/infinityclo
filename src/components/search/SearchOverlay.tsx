'use client';

/**
 * Search overlay.
 *
 * Queries are debounced and every in-flight response is sequence-checked, so a
 * slow early request can never overwrite the results of a later keystroke —
 * the classic search race that shows results for "ho" after you have typed
 * "hoodie".
 *
 * Arrow keys move through results, Enter opens the highlighted one, and Escape
 * closes. Focus is trapped and restored by `useFocusTrap`.
 */
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { formatMoney } from '@/domain/money';
import type { InventoryDisplayState, Money } from '@/domain/types';
import { track } from '@/lib/analytics';
import { cn } from '@/lib/cn';
import { useFocusTrap } from '@/lib/useFocusTrap';

interface SearchResult {
  slug: string;
  name: string;
  category: string | null;
  price: Money | null;
  availability: InventoryDisplayState;
  image: { url: string; alt: string } | null;
}

const DEBOUNCE_MS = 180;
const MIN_TERM_LENGTH = 2;

/**
 * Mounted only while open — the parent conditionally renders it — so closing
 * unmounts the component and its state resets naturally, with no teardown
 * effect to keep in sync.
 */
export function SearchOverlay({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const containerRef = useFocusTrap(true, onClose);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const requestSeq = useRef(0);

  const [term, setTerm] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle');
  const [highlight, setHighlight] = useState(-1);

  useEffect(() => {
    // Slight delay so the focus trap's initial focus does not fight this one.
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, []);

  /**
   * Debounced query. Every state change happens inside the timer callback
   * rather than in the effect body, so a fast typist never triggers a render
   * per keystroke. Previous results stay on screen while the next query is in
   * flight, which reads as continuity instead of a flicker to empty.
   */
  useEffect(() => {
    const trimmed = term.trim();

    const timer = window.setTimeout(async () => {
      if (trimmed.length < MIN_TERM_LENGTH) {
        setResults([]);
        setStatus('idle');
        setHighlight(-1);
        return;
      }

      const seq = (requestSeq.current += 1);
      setStatus('loading');

      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`);
        const data = (await response.json()) as { results: SearchResult[] };
        if (seq !== requestSeq.current) return;
        setResults(data.results);
        setStatus('done');
        setHighlight(-1);
        track({ name: 'search', term: trimmed, resultCount: data.results.length });
      } catch {
        if (seq !== requestSeq.current) return;
        setResults([]);
        setStatus('done');
      }
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [term]);

  const submit = useCallback(() => {
    const trimmed = term.trim();
    if (!trimmed) return;
    onClose();
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  }, [onClose, router, term]);

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (results.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlight((current) => (current + 1) % results.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((current) => (current <= 0 ? results.length - 1 : current - 1));
    } else if (event.key === 'Enter' && highlight >= 0) {
      event.preventDefault();
      const target = results[highlight];
      if (target) {
        onClose();
        router.push(`/products/${target.slug}`);
      }
    }
  }

  const trimmed = term.trim();
  const showNoResults =
    status === 'done' && trimmed.length >= MIN_TERM_LENGTH && results.length === 0;

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label="Search products"
      data-testid="search-overlay"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-[80] flex flex-col"
    >
      <button
        type="button"
        aria-label="Close search"
        onClick={onClose}
        className="bg-void/80 absolute inset-0 -z-10 h-full w-full cursor-default backdrop-blur-sm"
        tabIndex={-1}
      />

      <div className="bg-ink border-ash/60 border-b">
        <div className="edge mx-auto flex w-full max-w-4xl items-center gap-4 py-5">
          <form
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
            className="flex flex-1 items-center gap-3"
          >
            <label htmlFor="storefront-search" className="sr-only">
              Search products
            </label>
            <input
              id="storefront-search"
              ref={inputRef}
              type="search"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Search"
              autoComplete="off"
              data-testid="search-input"
              className="text-bone placeholder:text-dim font-display w-full bg-transparent text-2xl tracking-[0.04em] outline-none md:text-3xl"
            />
          </form>
          <button
            type="button"
            onClick={onClose}
            className="text-smoke hover:text-paper text-[0.7rem] font-semibold tracking-[0.16em] uppercase"
          >
            Close
          </button>
        </div>
      </div>

      <div className="bg-ink/98 flex-1 overflow-y-auto">
        <div className="edge mx-auto w-full max-w-4xl py-6">
          {status === 'idle' && trimmed.length < MIN_TERM_LENGTH && (
            <p className="text-dim text-sm">Type at least two characters.</p>
          )}

          {status === 'loading' && (
            <ul className="flex flex-col gap-3" aria-hidden>
              {Array.from({ length: 3 }).map((_, index) => (
                <li key={index} className="bg-carbon h-20 animate-pulse" />
              ))}
            </ul>
          )}

          {showNoResults && (
            <div data-testid="search-empty" className="py-8">
              <p className="font-display text-paper text-xl">Nothing matched “{trimmed}”.</p>
              <p className="text-smoke mt-2 text-sm">
                Try a shorter term, or{' '}
                <Link href="/shop" onClick={onClose} className="text-paper underline">
                  browse everything
                </Link>
                .
              </p>
            </div>
          )}

          {results.length > 0 && (
            <>
              <ul className="flex flex-col" data-testid="search-results">
                {results.map((result, index) => (
                  <li key={result.slug}>
                    <Link
                      href={`/products/${result.slug}`}
                      onClick={onClose}
                      onMouseEnter={() => setHighlight(index)}
                      className={cn(
                        'border-ash/30 flex items-center gap-4 border-b py-3 transition-colors',
                        highlight === index ? 'bg-carbon' : 'hover:bg-carbon/60',
                      )}
                    >
                      <div className="bg-carbon relative h-20 w-16 shrink-0 overflow-hidden">
                        {result.image && (
                          <Image
                            src={result.image.url}
                            alt={result.image.alt}
                            fill
                            sizes="64px"
                            className="object-cover"
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-paper truncate text-sm font-semibold">{result.name}</p>
                        {result.category && (
                          <p className="text-dim mt-0.5 text-[0.7rem] tracking-[0.12em] uppercase">
                            {result.category}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        {result.price && (
                          <p className="text-bone text-sm tabular-nums">
                            {formatMoney(result.price)}
                          </p>
                        )}
                        {result.availability === 'sold_out' && (
                          <p className="text-dim mt-0.5 text-[0.65rem] tracking-[0.12em] uppercase">
                            Sold out
                          </p>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={submit}
                className="text-paper mt-5 text-xs font-semibold tracking-[0.16em] uppercase underline underline-offset-4"
              >
                See all results
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
