import Link from 'next/link';

import type { Product } from '@/domain/types';

/**
 * FIT / FABRIC / CARE / SHIPPING & RETURNS — the four accordions from the
 * reference product page. Every line is the brand's own: product facts are
 * quoted from INFNITY's product copy (or the `infnity.*` metafields the admin
 * edits), and shipping/returns quote the store's published Shopify policies.
 * When the brand has not published a fact, the panel says so instead of
 * guessing — a customer orders against these.
 */
export function ProductDetails({ product }: { product: Product }) {
  const spec = product.specification;
  const notPublished = (what: string) => (
    <p>
      INFNITY hasn’t published {what} for this piece yet.{' '}
      <Link href="/contact" className="text-fg underline underline-offset-4">
        Ask us
      </Link>{' '}
      and we’ll tell you.
    </p>
  );

  const sections = [
    {
      id: 'fit',
      title: 'Fit',
      body:
        spec.fit || spec.modelInfo ? (
          <div className="flex flex-col gap-2">
            {spec.fit && <p>{spec.fit}</p>}
            {spec.modelInfo && <p className="text-fg">{spec.modelInfo}</p>}
          </div>
        ) : (
          notPublished('fit notes')
        ),
    },
    {
      id: 'fabric',
      title: 'Fabric',
      body:
        spec.materials || spec.weightGsm || spec.construction ? (
          <ul className="flex flex-col gap-2">
            {spec.materials && <li>{spec.materials}</li>}
            {spec.weightGsm && !spec.materials?.includes(String(spec.weightGsm)) && (
              <li>{spec.weightGsm} gsm</li>
            )}
            {spec.construction && <li>{spec.construction}</li>}
            {spec.countryOfOrigin && <li>Made in {spec.countryOfOrigin}</li>}
          </ul>
        ) : (
          notPublished('fabric details')
        ),
    },
    {
      id: 'care',
      title: 'Care',
      body: spec.care ? <p>{spec.care}</p> : notPublished('care instructions'),
    },
    {
      id: 'shipping',
      title: 'Shipping & Returns',
      body: (
        <div className="flex flex-col gap-2">
          <p>Orders take 2–3 business days to process, then 3–5 business days to ship.</p>
          <p>
            10-day returns on unworn items with tags, in original packaging. Sale items are final.
          </p>
          <p>
            Full terms:{' '}
            <Link href="/shipping" className="text-fg underline underline-offset-4">
              shipping
            </Link>{' '}
            ·{' '}
            <Link href="/returns" className="text-fg underline underline-offset-4">
              returns
            </Link>
          </p>
        </div>
      ),
    },
  ];

  return (
    <div className="border-line border-t" data-testid="product-accordions">
      {sections.map((section) => (
        <details key={section.id} className="border-line group border-b">
          <summary className="text-fg hover:text-fg-muted flex min-h-14 cursor-pointer list-none items-center justify-between py-4 text-[0.95rem] font-medium [&::-webkit-details-marker]:hidden">
            <span>{section.title}</span>
            <span
              aria-hidden
              className="ml-4 shrink-0 text-2xl leading-none font-light transition-transform duration-200 group-open:rotate-45"
            >
              +
            </span>
          </summary>
          <div className="text-fg-muted pb-5 text-sm leading-relaxed">{section.body}</div>
        </details>
      ))}
    </div>
  );
}

/** The product story, placed at the bottom of the panel as the owner's notes ask. */
export function ProductDescription({ product }: { product: Product }) {
  if (!product.description) return null;
  return (
    <section aria-labelledby="description-heading" className="mt-10">
      <h2
        id="description-heading"
        className="text-fg-faint mb-4 text-[0.66rem] font-semibold tracking-[0.24em] uppercase"
      >
        Description
      </h2>
      <div className="text-fg-muted flex flex-col gap-2 text-sm leading-relaxed">
        {product.description
          .split(/\n+/)
          .map((line) => line.replace(/^[•\-\s]+/, '').trim())
          .filter(Boolean)
          .map((line, index) => (
            <p key={index}>{line}</p>
          ))}
      </div>
    </section>
  );
}
