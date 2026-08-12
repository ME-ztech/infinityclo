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
  themeColor: '#050505',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-CA" className={`${archivo.variable} ${anton.variable}`}>
      <body className="bg-void text-bone min-h-dvh antialiased">
        <CartProvider>
          <a
            href="#main"
            className="sr-only-focusable bg-paper text-void focus:ring-paper absolute top-2 left-2 z-[100] px-4 py-2 text-sm font-semibold"
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
