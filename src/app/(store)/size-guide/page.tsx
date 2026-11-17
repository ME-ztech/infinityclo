import type { Metadata } from 'next';
import Link from 'next/link';

import { PolicyPage } from '@/components/content/PolicyPage';
import { catalogRepository } from '@/data';
import sizeGuides from '@/data/catalog/size-guides.json';
import assignments from '@/data/catalog/size-guide-assignments.json';
import type { SizeGuide } from '@/domain/types';

export const metadata: Metadata = {
  title: 'Size guide',
  description: 'Garment measurements published by INFNITY.',
  alternates: { canonical: '/size-guide' },
};

/**
 * Only brand-published measurements. A women's guide and tee/tank charts have
 * not been published by INFNITY, so they are named as not yet available rather
 * than estimated.
 */
export default async function SizeGuidePage() {
  const guides = sizeGuides as SizeGuide[];
  const assigned = Object.entries(assignments as Record<string, string>).filter(
    ([key]) => !key.startsWith('_'),
  );
  const products = await catalogRepository.getProductsBySlugs(assigned.map(([slug]) => slug));
  return (
    <PolicyPage
      title="Size guide"
      intro="Garment measurements as published by INFNITY, in inches. Measure a piece you own and compare."
    >
      <div className="flex flex-col gap-14">
        {guides.map((guide) => (
          <section key={guide.id} aria-labelledby={`guide-${guide.id}`}>
            <h2 id={`guide-${guide.id}`} className="font-display text-2xl">
              {guide.name}
            </h2>
            <div
              className="-mx-2 mt-4 overflow-x-auto px-2"
              tabIndex={0}
              role="region"
              aria-label={`${guide.name} table, scrolls sideways`}
            >
              <table className="w-full min-w-[420px] border-collapse text-sm">
                <caption className="sr-only">{guide.name} measurements in inches</caption>
                <thead>
                  <tr className="border-line border-b">
                    <th
                      scope="col"
                      className="text-fg-faint py-3 pr-4 text-left text-[0.68rem] tracking-[0.16em] uppercase"
                    >
                      Measurement
                    </th>
                    {guide.sizes.map((size) => (
                      <th
                        key={size}
                        scope="col"
                        className="text-fg-faint px-3 py-3 text-center text-[0.68rem] tracking-[0.16em] uppercase"
                      >
                        {size}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {guide.rows.map((row) => (
                    <tr key={row.label} className="border-line border-b">
                      <th scope="row" className="text-fg-muted py-3 pr-4 text-left font-normal">
                        {row.label} <span className="text-fg-faint text-xs">({row.unit})</span>
                      </th>
                      {guide.sizes.map((size) => (
                        <td key={size} className="px-3 py-3 text-center tabular-nums">
                          {row.measurements.find((m) => m.size === size)?.value ?? '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {guide.notes && <p className="text-fg-faint mt-3 text-xs">{guide.notes}</p>}
            <p className="text-fg-muted mt-3 text-sm">
              Applies to:{' '}
              {products
                .filter((product) =>
                  assigned.some(([slug, id]) => slug === product.slug && id === guide.id),
                )
                .map((product, index) => (
                  <span key={product.slug}>
                    {index > 0 && ', '}
                    <Link
                      href={`/products/${product.slug}`}
                      className="text-fg underline underline-offset-4"
                    >
                      {product.name}
                    </Link>
                  </span>
                ))}
            </p>
          </section>
        ))}
        <section aria-labelledby="not-published" className="border-line border-t pt-8">
          <h2 id="not-published" className="font-display text-xl">
            Not yet published
          </h2>
          <p className="text-fg-muted mt-3 text-sm leading-relaxed">
            INFNITY hasn’t published measurement charts for tees, tanks, jerseys, jorts, hoodies
            outside the zip range, or a women’s size guide. Many product pages say what size the
            model wears (for example, “The model is 5’2 wearing an S”), and jorts list their waist
            size in the size name. For anything else,{' '}
            <Link href="/contact" className="text-fg underline underline-offset-4">
              ask us
            </Link>
            .
          </p>
        </section>
      </div>
    </PolicyPage>
  );
}
