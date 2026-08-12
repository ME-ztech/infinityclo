import type { ReactNode } from 'react';

/**
 * Shared shell for support and legal pages.
 *
 * `PendingNotice` is the important part: several of these documents cannot be
 * completed without operating facts only the brand holds (carrier, return
 * address, processing times, legal entity). Rather than filling those in with
 * plausible defaults — which would be a false promise to a customer and a legal
 * exposure to the brand — the page states exactly what is outstanding.
 */
export function PolicyPage({
  title,
  intro,
  lastUpdated,
  children,
}: {
  title: string;
  intro?: string;
  lastUpdated?: string;
  children: ReactNode;
}) {
  return (
    <div className="edge pt-28 pb-[--spacing-section] md:pt-36">
      <header className="mb-12 max-w-2xl">
        <h1 className="font-display text-headline text-paper">{title}</h1>
        {intro && <p className="text-smoke mt-5 text-sm leading-relaxed">{intro}</p>}
        {lastUpdated && (
          <p className="text-dim mt-4 text-[0.7rem] tracking-[0.14em] uppercase">
            Last updated {lastUpdated}
          </p>
        )}
      </header>

      <div className="max-w-2xl">{children}</div>
    </div>
  );
}

export function PolicySection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="border-ash/50 border-t py-8 first:border-t-0 first:pt-0">
      <h2 className="text-paper mb-4 text-sm font-semibold tracking-[0.14em] uppercase">
        {heading}
      </h2>
      <div className="text-smoke flex flex-col gap-4 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

/**
 * Marks information that is genuinely unknown. Deliberately visible rather than
 * a code comment: the customer deserves to know the difference between a term
 * that is settled and one that is not.
 */
export function PendingNotice({ children }: { children: ReactNode }) {
  return (
    <p className="border-ash text-bone border-l-2 py-1 pl-4 text-sm leading-relaxed">
      <span className="text-dim mr-2 text-[0.68rem] font-semibold tracking-[0.16em] uppercase">
        Pending
      </span>
      {children}
    </p>
  );
}
