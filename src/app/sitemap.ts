import type { MetadataRoute } from 'next';

import { catalogRepository } from '@/data';
import { SITE_URL } from '@/lib/site';

export const revalidate = 3600;

const STATIC_ROUTES: ReadonlyArray<{ path: string; priority: number }> = [
  { path: '/', priority: 1 },
  { path: '/shop', priority: 0.9 },
  { path: '/community', priority: 0.7 },
  { path: '/about', priority: 0.6 },
  { path: '/size-guide', priority: 0.6 },
  { path: '/contact', priority: 0.5 },
  { path: '/faq', priority: 0.5 },
  { path: '/shipping', priority: 0.4 },
  { path: '/returns', priority: 0.4 },
  { path: '/privacy', priority: 0.3 },
  { path: '/terms', priority: 0.3 },
];

/**
 * Only public, canonical pages. Cart, account, admin, search results and drop
 * previews are deliberately absent (and disallowed in robots.txt).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { products } = await catalogRepository.listProducts();
  const now = new Date();

  return [
    ...STATIC_ROUTES.map((route) => ({
      url: `${SITE_URL}${route.path}`,
      lastModified: now,
      priority: route.priority,
    })),
    ...products.map((product) => ({
      url: `${SITE_URL}/products/${product.slug}`,
      lastModified: product.publishedAt ? new Date(product.publishedAt) : now,
      priority: 0.8,
    })),
  ];
}
