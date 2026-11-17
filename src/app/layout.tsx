import type { Metadata, Viewport } from 'next';
import { Anton, Archivo } from 'next/font/google';

import { CartDrawer } from '@/components/cart/CartDrawer';
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { StorefrontOnly } from '@/components/layout/StorefrontOnly';
import { CartProvider } from '@/lib/cart/CartProvider';
import { BRAND, SITE_URL } from '@/lib/site';
import { getSiteContent } from '@/server/cms';

import './globals.css';

const archivo = Archivo({
  subsets: ['latin'],
  variable: '--font-archivo',
  display: 'swap',
  weight: ['400', '500', '600', '700', '800', '900'],
});

const anton = Anton({
  subsets: ['latin'],
  variable: '--font-anton',
  display: 'swap',
  weight: '400',
});

/** The brand's own description of itself, as published on infinityclo.ca. */
const DESCRIPTION =
  'INFNITY — where raw identity meets untouchable design. Streetwear from Winnipeg, Canada. Be the Statement.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${BRAND.name} — ${BRAND.tagline}`,
    template: `%s — ${BRAND.name}`,
  },
  description: DESCRIPTION,
  applicationName: BRAND.name,
  openGraph: {
    type: 'website',
    siteName: BRAND.name,
    title: `${BRAND.name} — ${BRAND.tagline}`,
    description: DESCRIPTION,
    url: SITE_URL,
    locale: 'en_CA',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${BRAND.name} — ${BRAND.tagline}`,
    description: DESCRIPTION,
  },
  robots: { index: true, follow: true },
  alternates: { canonical: '/' },
};

export const viewport: Viewport = {
  themeColor: '#ffffff',
  colorScheme: 'light',
  width: 'device-width',
  initialScale: 1,
};

/** Announcement and social links are owner-editable, so the shell re-reads them. */
export const revalidate = 60;

function organizationSchema(sameAs: readonly string[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: BRAND.name,
    alternateName: 'Infnity.clo',
    url: SITE_URL,
    logo: `${SITE_URL}/brand/emblem.png`,
    slogan: BRAND.tagline,
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Winnipeg',
      addressRegion: 'MB',
      addressCountry: 'CA',
    },
    ...(sameAs.length > 0 && { sameAs }),
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const content = await getSiteContent();

  const social = [
    { label: 'Instagram', href: content.social.instagram },
    { label: 'Facebook', href: content.social.facebook },
    { label: 'Threads', href: content.social.threads },
  ].filter((item) => item.href);

  const announcement =
    content.announcement.enabled && content.announcement.text
      ? { text: content.announcement.text, href: content.announcement.href }
      : null;

  return (
    <html lang="en-CA" className={`${archivo.variable} ${anton.variable}`}>
      <head>
        {/* Scroll reveals start at opacity 0 and are brought in by an
            IntersectionObserver. With scripting off that observer never runs,
            which would leave sections as blank rectangles. The animation is an
            enhancement; the content is not. */}
        <noscript>
          <style>{'[data-reveal]{opacity:1!important;transform:none!important}'}</style>
        </noscript>
      </head>
      {/* `data-surface` on the body is the root of the token cascade: the store
          is white, and any section that wants another material declares it. */}
      <body data-surface="paper" className="bg-surface text-fg min-h-dvh antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationSchema(social.map((item) => item.href))),
          }}
        />
        <CartProvider>
          <StorefrontOnly>
            <a
              href="#main"
              className="sr-only-focusable bg-inverse-surface text-inverse-fg absolute top-2 left-2 z-[100] px-4 py-2 text-sm font-semibold"
            >
              Skip to content
            </a>
            <Header announcement={announcement} />
          </StorefrontOnly>
          <main id="main">{children}</main>
          <StorefrontOnly>
            <Footer social={social} />
            <CartDrawer />
          </StorefrontOnly>
        </CartProvider>
      </body>
    </html>
  );
}
