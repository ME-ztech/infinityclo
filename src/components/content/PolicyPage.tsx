import type { ReactNode } from 'react';

/**
 * Policy and content page shell.
 *
 * The title is centred, like every headline on the store; the body is
 * left-aligned at a reading measure, because long legal copy is not.
 */
export function PolicyPage({
  title,
  intro,
  lastUpdated,
  note,
  children,
}: {
  title: string;
  intro?: string;
  lastUpdated?: string;
  /** Provenance / review note shown under the title. */
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="edge pt-12 pb-(--spacing-section) md:pt-20">
      <header className="mx-auto mb-12 max-w-2xl text-center">
        <h1 className="font-display text-headline text-fg text-balance">{title}</h1>
        {intro && <p className="text-fg-muted mt-5 text-sm leading-relaxed">{intro}</p>}
        {lastUpdated && (
          <p className="text-fg-faint mt-4 text-[0.7rem] tracking-[0.14em] uppercase">
            {lastUpdated}
          </p>
        )}
        {note && <div className="mt-6 text-left">{note}</div>}
      </header>

      <div className="mx-auto max-w-2xl">{children}</div>
    </div>
  );
}

export function PolicySection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="border-line border-t py-8 first:border-t-0 first:pt-0">
      <h2 className="text-fg mb-4 text-sm font-semibold tracking-[0.14em] uppercase">{heading}</h2>
      <div className="text-fg-muted flex flex-col gap-4 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

/**
 * Marks a policy as carried over from the legacy store. The wording is the
 * owner's own; the note tells staff and customers it has not yet been through
 * owner/legal review for the new storefront.
 */
export function CarriedOverNotice() {
  return (
    <p
      data-testid="policy-review-note"
      className="border-line text-fg-muted border px-4 py-3 text-xs leading-relaxed"
    >
      Carried over from infinityclo.ca — pending owner/legal review.
    </p>
  );
}

export interface PolicyBlock {
  readonly tag: 'h' | 'p' | 'li';
  readonly text: string;
}

/**
 * Renders a policy imported block-for-block from the legacy store. Text is
 * rendered as text nodes only, so imported copy can never inject markup.
 */
export function PolicyBlocks({ blocks }: { blocks: readonly PolicyBlock[] }) {
  const nodes: ReactNode[] = [];
  let list: string[] = [];

  const flush = () => {
    if (list.length === 0) return;
    nodes.push(
      <ul key={`list-${nodes.length}`} className="flex list-disc flex-col gap-2 pl-5">
        {list.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>,
    );
    list = [];
  };

  blocks.forEach((block, index) => {
    if (block.tag === 'li') {
      list.push(block.text);
      return;
    }
    flush();
    nodes.push(
      block.tag === 'h' ? (
        <h2
          key={index}
          className="text-fg border-line mt-6 border-t pt-8 text-sm font-semibold tracking-[0.1em] uppercase first:mt-0 first:border-t-0 first:pt-0"
        >
          {block.text}
        </h2>
      ) : (
        <p key={index} className="whitespace-pre-line">
          {block.text}
        </p>
      ),
    );
  });
  flush();

  return <div className="text-fg-muted flex flex-col gap-4 text-sm leading-relaxed">{nodes}</div>;
}
