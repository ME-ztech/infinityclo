import type { MetadataRoute } from 'next';

import { SITE_URL } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Admin, account and cart are private or per-visitor; API routes are not
      // pages; search fragments the catalogue's canonical identity across query
      // permutations; drop previews are unpublished.
      disallow: ['/admin', '/account', '/api/', '/cart', '/search', '/preview'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
