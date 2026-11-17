import type { Metadata } from 'next';

import { PolicyPage } from '@/components/content/PolicyPage';
import { SizeChartView } from '@/components/product/SizeChartView';
import { SIZE_CHARTS } from '@/domain/size-charts';

export const metadata: Metadata = {
  title: 'Size Guide',
  description: 'INFNITY size charts for tees, pullover hoodies, zip hoodies and bottoms.',
  alternates: { canonical: '/size-guide' },
};

const ORDER = ['tee', 'pullover-hoodie', 'zip-hoodie', 'bottoms'] as const;

/**
 * The four size charts INFNITY has published. Garments without a chart
 * (tanks, jerseys, jorts, accessories) are deliberately absent: no measurements
 * have been inferred for them.
 */
export default function SizeGuidePage() {
  return (
    <PolicyPage
      title="Size Guide"
      intro="INFNITY’s published size charts. All measurements are garment measurements, in inches."
    >
      <nav aria-label="Size charts" className="mb-10">
        <ul className="flex flex-wrap justify-center gap-2">
          {ORDER.map((id) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className="border-line text-fg hover:border-fg flex min-h-11 items-center border px-4 text-[0.7rem] font-semibold tracking-[0.14em] uppercase"
              >
                {SIZE_CHARTS[id].title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex flex-col gap-16">
        {ORDER.map((id) => (
          <section key={id} id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-28">
            <h2 id={`${id}-heading`} className="font-display text-title text-fg mb-5 text-center">
              {SIZE_CHARTS[id].title}
            </h2>
            <SizeChartView chart={SIZE_CHARTS[id]} />
          </section>
        ))}
      </div>

      <p className="text-fg-muted mt-14 text-center text-sm leading-relaxed">
        A chart for a piece not listed here has not been published yet. If you are between sizes,
        message us on Instagram @infnity.clo before ordering.
      </p>
    </PolicyPage>
  );
}
