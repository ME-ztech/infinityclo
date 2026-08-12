/**
 * Product intelligence sections.
 *
 * Renders only the sections that have content. A garment with no confirmed
 * material composition shows no Materials section at all — an accordion that
 * opens onto "Information coming soon" is worse than no accordion, and a made-up
 * composition is worse than both.
 *
 * Shipping and Returns are the exception: they link to the policy pages rather
 * than restating terms, so there is one source of truth for them.
 */
import Link from 'next/link';

import type { Product } from '@/domain/types';

interface Section {
  id: string;
  title: string;
  body: React.ReactNode;
  defaultOpen?: boolean;
}

export function ProductDetails({ product }: { product: Product }) {
  const spec = product.specification;

  const sections: Section[] = [];

  if (product.description) {
    sections.push({
      id: 'details',
      title: 'Details',
      defaultOpen: true,
      body: (
        <div className="flex flex-col gap-3">
          {product.description.split('\n\n').map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      ),
    });
  }

  if (spec.fit || spec.modelInfo) {
    sections.push({
      id: 'fit',
      title: 'Fit',
      body: (
        <div className="flex flex-col gap-2">
          {spec.fit && <p>{spec.fit}</p>}
          {spec.modelInfo && <p className="text-fg">{spec.modelInfo}</p>}
        </div>
      ),
    });
  }

  if (spec.materials || spec.weightGsm || spec.construction) {
    sections.push({
      id: 'materials',
      title: 'Materials',
      body: (
        <ul className="flex flex-col gap-2">
          {spec.materials && <li>{spec.materials}</li>}
          {spec.weightGsm && <li>{spec.weightGsm} gsm</li>}
          {spec.construction && <li>{spec.construction}</li>}
          {spec.countryOfOrigin && <li>Made in {spec.countryOfOrigin}</li>}
        </ul>
      ),
    });
  }

  if (spec.care) {
    sections.push({ id: 'care', title: 'Care', body: <p>{spec.care}</p> });
  }

  sections.push({
    id: 'shipping',
    title: 'Shipping & Returns',
    body: (
      <p>
        See{' '}
        <Link href="/shipping" className="text-fg underline underline-offset-4">
          shipping
        </Link>{' '}
        and{' '}
        <Link href="/returns" className="text-fg underline underline-offset-4">
          returns
        </Link>{' '}
        for current terms.
      </p>
    ),
  });

  return (
    <div className="border-line mt-10 border-t">
      {sections.map((section) => (
        <details key={section.id} open={section.defaultOpen} className="border-line group border-b">
          <summary className="text-fg-muted hover:text-fg flex cursor-pointer list-none items-center justify-between py-4 text-xs font-semibold tracking-[0.16em] uppercase [&::-webkit-details-marker]:hidden">
            {section.title}
            <span
              aria-hidden
              className="text-fg-faint ml-4 shrink-0 text-lg leading-none transition-transform duration-200 group-open:rotate-45"
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
