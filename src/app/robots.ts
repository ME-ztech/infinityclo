import type { MetadataRoute } from 'next';

import { SITE_URL } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Cart and account are per-visitor; search fragments the catalog's
      // canonical identity across query permutations.
      disallow: ['/api/', '/cart', '/account', '/search'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
