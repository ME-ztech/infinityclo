import type { Metadata, Viewport } from 'next';
import { Archivo, Poppins } from 'next/font/google';

import { CartDrawer } from '@/components/cart/CartDrawer';
import { AnnouncementBar } from '@/components/layout/AnnouncementBar';
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { CartProvider } from '@/lib/cart/CartProvider';
import { BRAND, SITE_URL } from '@/lib/site';
import { StoreConfigProvider, type StoreConfig } from '@/lib/store-config';
import { getCms, getSettings } from '@/server/content/cms';
import { checkoutMode, isCustomerAccountConfigured, shopifyConfig } from '@/server/shopify/config';

import './globals.css';

const archivo = Archivo({
  subsets: ['latin'],
  variable: '--font-archivo',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

/** Display face: an OFL stand-in for the live store's ITC Avant Garde Gothic Bold Oblique. */
const poppins = Poppins({
  subsets: ['latin'],
  variable: '--font-poppins',
  display: 'swap',
  weight: ['700', '800'],
  style: ['normal', 'italic'],
});

const DESCRIPTION =
  'Infnity.clo is where raw identity meets untouchable design. Built for the ones who don’t fold, don’t follow — and never settle.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${BRAND.name} — ${BRAND.tagline}`, template: `%s — ${BRAND.name}` },
  description: DESCRIPTION,
  applicationName: BRAND.name,
  icons: { icon: '/brand/infnity-mark.png' },
  openGraph: {
    type: 'website',
    siteName: BRAND.name,
    title: `${BRAND.name} — ${BRAND.tagline}`,
    description: DESCRIPTION,
    url: SITE_URL,
    locale: 'en_CA',
  },
  twitter: { card: 'summary_large_image', title: `${BRAND.name} — ${BRAND.tagline}`, description: DESCRIPTION },
  robots: { index: process.env.NEXT_PUBLIC_NOINDEX !== 'true', follow: true },
  alternates: { canonical: '/' },
};

export const viewport: Viewport = {
  themeColor: '#ffffff',
  colorScheme: 'light',
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [settings, announcement] = await Promise.all([getSettings(), getCms('announcement')]);
  const storeConfig: StoreConfig = {
    checkoutMode: checkoutMode(),
    cartUpsellEnabled: settings.cartUpsellEnabled,
    nativeAccounts: isCustomerAccountConfigured(),
    accountUrl: isCustomerAccountConfigured() ? '/account' : shopifyConfig().hostedAccountUrl,
  };

  return (
    <html lang="en-CA" className={`${archivo.variable} ${poppins.variable}`}>
      <head>
        <noscript>
          <style>{'[data-reveal]{opacity:1!important;transform:none!important}'}</style>
        </noscript>
      </head>
      <body data-surface="paper" className="bg-surface text-fg min-h-dvh antialiased">
        <StoreConfigProvider value={storeConfig}>
          <CartProvider>
            <a
              href="#main"
              className="sr-only-focusable bg-fg text-paper absolute top-2 left-2 z-[100] px-4 py-2 text-sm font-semibold"
            >
              Skip to content
            </a>
            <AnnouncementBar content={announcement.value} />
            <Header />
            <main id="main">{children}</main>
            <Footer settings={settings} />
            <CartDrawer />
          </CartProvider>
        </StoreConfigProvider>
      </body>
    </html>
  );
}
