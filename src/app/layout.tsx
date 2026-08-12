import type { Metadata, Viewport } from 'next';
import { Anton, Archivo } from 'next/font/google';

import { CartDrawer } from '@/components/cart/CartDrawer';
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { CartProvider } from '@/lib/cart/CartProvider';
import { BRAND, SITE_URL } from '@/lib/site';

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

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${BRAND.name} — ${BRAND.tagline}`,
    template: `%s — ${BRAND.name}`,
  },
  description:
    'INFNITY is a streetwear label built on raw identity and heavyweight construction. Be the Statement.',
  applicationName: BRAND.name,
  openGraph: {
    type: 'website',
    siteName: BRAND.name,
    title: `${BRAND.name} — ${BRAND.tagline}`,
    description: 'Streetwear built on raw identity and heavyweight construction.',
    url: SITE_URL,
    locale: 'en_CA',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${BRAND.name} — ${BRAND.tagline}`,
    description: 'Streetwear built on raw identity and heavyweight construction.',
  },
  robots: { index: true, follow: true },
  alternates: { canonical: '/' },
};

export const viewport: Viewport = {
  // Matches the header's bone bar, so iOS tints its chrome to the same material
  // the page starts on rather than to the black it used to start on.
  themeColor: '#f6f3ed',
  colorScheme: 'light',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-CA" className={`${archivo.variable} ${anton.variable}`}>
      {/* `data-surface` on the body is the root of the token cascade: every
          section overrides it, and anything outside a section — drawers,
          dialogs, the skip link — resolves against bone. */}
      <head>
        {/* Scroll reveals start at opacity 0 and are brought in by an
            IntersectionObserver. With scripting off that observer never runs,
            which would leave the manifesto and the campaign sections as blank
            rectangles. The animation is an enhancement; the content is not. */}
        <noscript>
          <style>{'[data-reveal]{opacity:1!important;transform:none!important}'}</style>
        </noscript>
      </head>
      <body data-surface="bone" className="bg-surface text-fg min-h-dvh antialiased">
        <CartProvider>
          <a
            href="#main"
            className="sr-only-focusable bg-signal text-paper absolute top-2 left-2 z-[100] px-4 py-2 text-sm font-semibold"
          >
            Skip to content
          </a>
          {/* The preview notice is rendered inside Header's fixed stack. */}
          <Header />
          <main id="main">{children}</main>
          <Footer />
          <CartDrawer />
        </CartProvider>
      </body>
    </html>
  );
}
