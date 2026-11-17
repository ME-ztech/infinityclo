/**
 * INFNITY's published size charts.
 *
 * Four charts exist on the legacy store, as graphics. They are reproduced here
 * exactly — the graphic itself, plus the same figures transcribed into a table
 * so the guide is readable by screen readers and on small screens.
 *
 * No chart exists for tanks, jerseys, button shirts, jorts or accessories, and
 * none has been inferred. Those products show no size guide until the brand
 * supplies one (docs/assets-and-rights.md lists the request, including the
 * women's guide).
 */
import { categoryGroupOf } from './taxonomy';
import type { Product } from './types';

export type SizeChartId = 'tee' | 'pullover-hoodie' | 'zip-hoodie' | 'bottoms';

export interface SizeChart {
  readonly id: SizeChartId;
  /** The chart's own title, as the brand published it. */
  readonly title: string;
  readonly image: { readonly url: string; readonly width: number; readonly height: number };
  readonly unit: 'in';
  readonly sizes: readonly string[];
  readonly rows: ReadonlyArray<{ readonly label: string; readonly values: readonly string[] }>;
  readonly sourceUrl: string;
}

export const SIZE_CHARTS: Readonly<Record<SizeChartId, SizeChart>> = {
  tee: {
    id: 'tee',
    title: 'Infinity Summa 24’ Tees',
    image: { url: '/size-charts/tee-01-a59fef5d.png', width: 1600, height: 1600 },
    unit: 'in',
    sizes: ['S', 'M', 'L', 'XL', '2XL'],
    rows: [
      { label: 'Length', values: ['25 5/8', '26 5/8', '27 4/8', '28 6/8', '29 4/8'] },
      { label: 'Pit to pit', values: ['21 5/8', '22 7/8', '23 5/8', '24 6/8', '25 5/8'] },
      { label: 'Shoulder', values: ['23 3/8', '23 7/8', '23 7/8', '24 5/8', '25'] },
      { label: 'Sleeve length', values: ['8 5/8', '9', '9', '9 4/8', '9 7/8'] },
    ],
    sourceUrl: 'https://infinityclo.ca/pages/tee-shirt-size-chart',
  },
  'pullover-hoodie': {
    id: 'pullover-hoodie',
    title: 'Pullover Hoodie',
    image: { url: '/size-charts/pullover-hoodie-01-d45573d8.png', width: 1600, height: 1600 },
    unit: 'in',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    rows: [
      { label: 'Length', values: ['24.5', '25', '25.5', '26', '26.5'] },
      { label: 'Width', values: ['24', '25', '26', '27', '28'] },
      { label: 'Sleeve length', values: ['25', '25.5', '26', '26.5', '27'] },
    ],
    sourceUrl: 'https://infinityclo.ca/pages/pullover-hoodies',
  },
  'zip-hoodie': {
    id: 'zip-hoodie',
    title: 'Zip Hoodies',
    image: { url: '/size-charts/zip-hoodie-01-03a0977d.png', width: 1600, height: 1600 },
    unit: 'in',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    rows: [
      { label: 'Length', values: ['24.5', '25', '25.5', '26', '26.5'] },
      { label: 'Width', values: ['24', '25', '26', '27', '28'] },
      { label: 'Sleeve length', values: ['25', '25.5', '26', '26.5', '27'] },
    ],
    sourceUrl: 'https://infinityclo.ca/pages/zip-up-hoodie-size-chart',
  },
  bottoms: {
    id: 'bottoms',
    title: 'Straight Cut Bottoms',
    image: { url: '/size-charts/bottoms-01-790e0ae9.png', width: 1600, height: 1600 },
    unit: 'in',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    rows: [
      { label: 'Hip', values: ['39', '40', '43', '45', '47'] },
      { label: 'Waist', values: ['30–32', '32–34', '34–36', '36–38', '38–40'] },
      { label: 'Length', values: ['40', '41', '42', '43', '44'] },
      { label: 'Leg opening', values: ['22 3/4', '23 3/4', '24 3/4', '25 3/4', '26 3/4'] },
    ],
    sourceUrl: 'https://infinityclo.ca/pages/bottom-size-chart',
  },
};

/**
 * The chart a product gets when the owner has not assigned one.
 *
 * Matched only where the product's own name says what it is: a "tee", a
 * "zip-up", a "hoodie", "sweatpants". Anything else — including every garment
 * the brand never charted — gets none.
 */
export function defaultSizeChartFor(product: Pick<Product, 'name' | 'category'>): SizeChartId | null {
  const name = product.name.toLowerCase();
  const group = categoryGroupOf(product as Product);
  if (group === 'hoodies') return /\bzip/.test(name) ? 'zip-hoodie' : 'pullover-hoodie';
  if (group === 'bottoms') return /\bsweat ?pants?\b/.test(name) ? 'bottoms' : null;
  if (group === 'tops') return /\btees?\b/.test(name) ? 'tee' : null;
  return null;
}
