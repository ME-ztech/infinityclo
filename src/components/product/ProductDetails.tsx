/**
 * Product detail accordions: FIT, FABRIC, CARE, SHIPPING & RETURNS.
 *
 * Fit, fabric and care come from what the owner has entered in admin, falling
 * back to facts the importer read out of the brand's own product copy. A section
 * with no confirmed content is omitted — an accordion that opens onto a guess is
 * worse than no accordion.
 *
 * Shipping & Returns is always present and summarises the store's actual
 * policies, linking to the full text.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';

export interface ProductDetailSections {
  readonly fit: string | null;
  readonly fabric: string | null;
  readonly care: string | null;
}

function lines(text: string): ReactNode {
  return (
    <div className="flex flex-col gap-2">
      {text
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line, index) => (
          <p key={index}>{line}</p>
        ))}
    </div>
  );
}

export function ProductDetails({ sections }: { sections: ProductDetailSections }) {
  const items: Array<{ id: string; title: string; body: ReactNode }> = [];

  if (sections.fit) items.push({ id: 'fit', title: 'Fit', body: lines(sections.fit) });
  if (sections.fabric) items.push({ id: 'fabric', title: 'Fabric', body: lines(sections.fabric) });
  if (sections.care) items.push({ id: 'care', title: 'Care', body: lines(sections.care) });

  items.push({
    id: 'shipping',
    title: 'Shipping & Returns',
    body: (
      <div className="flex flex-col gap-2">
        <p>
          Orders take 2–3 business days to process, then 3–5 business days to ship. Shipping and
          taxes are calculated at checkout.
        </p>
        <p>
          Returns are accepted within 10 days of delivery — unworn, with tags, in original
          packaging. Sale items cannot be returned.
        </p>
        <p>
          <Link href="/shipping" className="text-fg underline underline-offset-4">
            Shipping policy
          </Link>
          {' · '}
          <Link href="/returns" className="text-fg underline underline-offset-4">
            Returns policy
          </Link>
        </p>
      </div>
    ),
  });

  return (
    <div className="border-line mt-8 border-t" data-testid="product-accordions">
      {items.map((item) => (
        <details
          key={item.id}
          className="border-line group border-b"
          data-testid={`accordion-${item.id}`}
        >
          <summary className="text-fg flex min-h-14 cursor-pointer list-none items-center justify-between text-sm [&::-webkit-details-marker]:hidden">
            {item.title}
            <span
              aria-hidden
              className="text-fg ml-4 shrink-0 text-xl leading-none transition-transform duration-200 group-open:rotate-45"
            >
              +
            </span>
          </summary>
          <div className="text-fg-muted pb-5 text-sm leading-relaxed">{item.body}</div>
        </details>
      ))}
    </div>
  );
}
