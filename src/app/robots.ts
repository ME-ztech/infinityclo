import type { MetadataRoute } from 'next';

import { SITE_URL } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  // Staging/previews set NEXT_PUBLIC_NOINDEX=true so they are never indexed.
  if (process.env.NEXT_PUBLIC_NOINDEX === 'true') {
    return { rules: { userAgent: '*', disallow: '/' } };
  }
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Per-visitor, private or fragmenting routes; unpublished previews never reach the sitemap.
      disallow: ['/api/', '/admin', '/cart', '/account', '/search', '/newsletter/'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
