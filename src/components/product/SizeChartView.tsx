/**
 * One brand size chart: the transcribed table, then the original graphic.
 *
 * The table is the accessible, zoom-free version of the same figures; the
 * graphic is the brand's own artwork and shows where each measurement is taken.
 * The table scrolls inside its own container so the page never scrolls sideways.
 */
import Image from 'next/image';

import type { SizeChart } from '@/domain/size-charts';

export function SizeChartView({ chart }: { chart: SizeChart }) {
  return (
    <div data-testid="size-chart">
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[26rem] border-collapse text-sm">
          <caption className="text-fg-muted pb-3 text-left text-xs">
            {chart.title} — garment measurements in inches.
          </caption>
          <thead>
            <tr className="border-fg border-b">
              <th scope="col" className="text-fg py-3 pr-4 text-left text-xs font-semibold">
                Measurement
              </th>
              {chart.sizes.map((size) => (
                <th key={size} scope="col" className="text-fg px-2 py-3 text-center text-xs font-semibold">
                  {size}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {chart.rows.map((row) => (
              <tr key={row.label} className="border-line border-b">
                <th scope="row" className="text-fg py-3 pr-4 text-left font-medium">
                  {row.label}
                </th>
                {row.values.map((value, index) => (
                  <td key={index} className="text-fg-muted px-2 py-3 text-center whitespace-nowrap tabular-nums">
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Image
        src={chart.image.url}
        alt={`INFNITY size chart graphic for ${chart.title}, showing where each measurement is taken. The figures are in the table above.`}
        width={chart.image.width}
        height={chart.image.height}
        sizes="(min-width: 768px) 640px, 100vw"
        className="mx-auto mt-6 w-full max-w-md"
      />
    </div>
  );
}
