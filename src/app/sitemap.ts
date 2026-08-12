import type { MetadataRoute } from 'next';

import { catalogRepository } from '@/data';
import { SITE_URL } from '@/lib/site';

/** Static routes worth indexing. Cart, search and account are excluded. */
const STATIC_ROUTES: ReadonlyArray<{ path: string; priority: number }> = [
  { path: '/', priority: 1 },
  { path: '/shop', priority: 0.9 },
  { path: '/collections', priority: 0.8 },
  { path: '/vault', priority: 0.7 },
  { path: '/troop', priority: 0.7 },
  { path: '/about', priority: 0.6 },
  { path: '/contact', priority: 0.5 },
  { path: '/faq', priority: 0.5 },
  { path: '/shipping', priority: 0.4 },
  { path: '/returns', priority: 0.4 },
  { path: '/privacy', priority: 0.3 },
  { path: '/terms', priority: 0.3 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [productSlugs, collectionSlugs] = await Promise.all([
    catalogRepository.listProductSlugs(),
    catalogRepository.listCollectionSlugs(),
  ]);

  const now = new Date();

  return [
    ...STATIC_ROUTES.map((route) => ({
      url: `${SITE_URL}${route.path}`,
      lastModified: now,
      priority: route.priority,
    })),
    ...productSlugs.map((slug) => ({
      url: `${SITE_URL}/products/${slug}`,
      lastModified: now,
      priority: 0.8,
    })),
    ...collectionSlugs.map((slug) => ({
      url: `${SITE_URL}/collections/${slug}`,
      lastModified: now,
      priority: 0.7,
    })),
  ];
}
