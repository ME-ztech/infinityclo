import { CartDrawer } from '@/components/cart/CartDrawer';
import { AnnouncementBar } from '@/components/layout/AnnouncementBar';
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { CartProvider } from '@/lib/cart/CartProvider';
import { StoreConfigProvider, type StoreConfig } from '@/lib/store-config';
import { getCms, getSettings } from '@/server/content/cms';
import { checkoutMode, isCustomerAccountConfigured, shopifyConfig } from '@/server/shopify/config';

/** Storefront chrome: announcement bar, header, footer, cart drawer and the client store config. */
export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const [settings, announcement] = await Promise.all([getSettings(), getCms('announcement')]);
  const storeConfig: StoreConfig = {
    checkoutMode: checkoutMode(),
    cartUpsellEnabled: settings.cartUpsellEnabled,
    nativeAccounts: isCustomerAccountConfigured(),
    accountUrl: isCustomerAccountConfigured() ? '/account' : shopifyConfig().hostedAccountUrl,
  };
  return (
    <StoreConfigProvider value={storeConfig}>
      <CartProvider>
        <a href="#main" className="sr-only-focusable bg-fg text-paper absolute top-2 left-2 z-[100] px-4 py-2 text-sm font-semibold">
          Skip to content
        </a>
        <AnnouncementBar content={announcement.value} />
        <Header />
        <main id="main">{children}</main>
        <Footer settings={settings} />
        <CartDrawer />
      </CartProvider>
    </StoreConfigProvider>
  );
}
