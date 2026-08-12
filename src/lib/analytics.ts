/**
 * Analytics contract.
 *
 * One typed surface for the whole storefront so provider SDKs never get
 * sprinkled through components. Today every event goes to a no-op sink (plus
 * the console in development). Adding GA/Meta/TikTok in Phase 2 means
 * registering a sink here and nothing else.
 *
 * No provider credentials are required to build or run the storefront.
 */
import type { Money } from '@/domain/types';

interface ProductPayload {
  slug: string;
  name: string;
  price: Money;
}

export type AnalyticsEvent =
  | { name: 'page_view'; path: string; title?: string }
  | { name: 'product_view'; product: ProductPayload }
  | { name: 'collection_view'; slug: string; productCount: number }
  | { name: 'search'; term: string; resultCount: number }
  | { name: 'filter_applied'; filter: string; value: string }
  | { name: 'product_added_to_cart'; product: ProductPayload; variantId: string; quantity: number }
  | { name: 'product_removed_from_cart'; productSlug: string; variantId: string }
  | { name: 'cart_view'; lineCount: number; subtotal: Money }
  | { name: 'checkout_started'; lineCount: number; subtotal: Money }
  | { name: 'newsletter_signup'; source: string }
  | { name: 'wishlist_added'; productSlug: string }
  | { name: 'wishlist_removed'; productSlug: string }
  | { name: 'quick_add_opened'; productSlug: string }
  | { name: 'ugc_opened'; entryId: string };

export type AnalyticsSink = (event: AnalyticsEvent) => void;

const sinks: AnalyticsSink[] = [];

export function registerAnalyticsSink(sink: AnalyticsSink): () => void {
  sinks.push(sink);
  return () => {
    const index = sinks.indexOf(sink);
    if (index >= 0) sinks.splice(index, 1);
  };
}

/**
 * Fire-and-forget. A failing analytics sink must never break a purchase, so
 * every sink is isolated and errors are swallowed after being logged.
 */
export function track(event: AnalyticsEvent): void {
  if (process.env.NODE_ENV === 'development' && sinks.length === 0) {
    console.debug('[analytics]', event.name, event);
  }
  for (const sink of sinks) {
    try {
      sink(event);
    } catch (error) {
      console.error('[analytics] sink failed', error);
    }
  }
}
