/**
 * INFNITY domain model.
 *
 * These types are the contract between the storefront UI and whatever is
 * supplying data underneath it. Today that is a local JSON snapshot imported
 * from the legacy store; in Phase 2 it becomes PostgreSQL. Nothing in this file
 * may reference Next.js, React, or any storage technology.
 *
 * A deliberate convention runs through the model: any field the brand has not
 * yet confirmed is `null`, never a plausible-looking default. `null` renders as
 * an honest omission in the UI. A guessed value would render as a claim about a
 * garment the customer is about to buy, which is not ours to make.
 */

/** ISO-4217. The legacy store prices in Canadian dollars. */
export type CurrencyCode = 'CAD' | 'USD';

/**
 * Money is stored in minor units (cents) to keep arithmetic exact. Formatting
 * happens at the edge, in `formatMoney`, never in the data layer.
 */
export interface Money {
  readonly amount: number;
  readonly currency: CurrencyCode;
}

/**
 * What the customer is allowed to be told about stock.
 *
 * This is intentionally a *display* state rather than a raw count. The
 * storefront must never imply scarcity it cannot substantiate, so a real
 * inventory number never reaches the client. Phase 2 maps warehouse counts onto
 * these cases behind the repository boundary.
 */
export type InventoryDisplayState =
  | 'in_stock'
  | 'low_stock'
  | 'sold_out'
  /** Archive piece: was real, is not coming back, still shown in The Vault. */
  | 'archived'
  /** Stock is genuinely unknown to us — show nothing rather than guess. */
  | 'unknown';

export type MediaKind = 'product' | 'model' | 'detail' | 'campaign' | 'ugc';

export interface ProductMedia {
  readonly id: string;
  readonly url: string;
  readonly alt: string;
  readonly kind: MediaKind;
  readonly width: number;
  readonly height: number;
  /** Ordering within the gallery; lower sorts first. */
  readonly position: number;
  /** Legacy source URL, retained for provenance. See docs/ASSET_PROVENANCE.md. */
  readonly sourceUrl: string | null;
  /**
   * Tiny blurred placeholder (data URI) generated at import time. Optional
   * because it is a delivery optimisation, not brand data.
   */
  readonly blurDataUrl?: string | null;
}

/** A selectable axis on a product, e.g. Size or Colour. */
export interface ProductOption {
  readonly id: string;
  readonly name: string;
  readonly position: number;
  readonly values: readonly string[];
}

export interface ProductVariant {
  readonly id: string;
  readonly sku: string | null;
  readonly title: string;
  readonly price: Money;
  /** Original price when this variant is discounted; null when at full price. */
  readonly compareAtPrice: Money | null;
  readonly availability: InventoryDisplayState;
  /** Option name -> selected value, e.g. `{ Size: 'L', Colour: 'Black' }`. */
  readonly selectedOptions: Readonly<Record<string, string>>;
  /** Index into the product's media, so selecting a colour can swap the image. */
  readonly mediaId: string | null;
}

/**
 * Garment facts. Every field is nullable on purpose — see the note at the top
 * of this file. An unconfirmed weight is `null`, not "heavyweight".
 */
export interface ProductSpecification {
  readonly materials: string | null;
  readonly fit: string | null;
  readonly care: string | null;
  readonly construction: string | null;
  readonly weightGsm: number | null;
  readonly countryOfOrigin: string | null;
  /**
   * How the garment sits on the model in the photographs, e.g. "Model is 6'1\"
   * and wears a size L". Only ever set from the brand's own product copy — a
   * customer sizes an order against this, so a plausible-sounding guess here is
   * the most expensive kind of invention on the whole record.
   */
  readonly modelInfo: string | null;
}

export interface Product {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  /** Short editorial line used on cards and meta descriptions. */
  readonly tagline: string | null;
  readonly description: string | null;
  readonly category: string | null;
  readonly collectionSlugs: readonly string[];
  readonly options: readonly ProductOption[];
  readonly variants: readonly ProductVariant[];
  readonly media: readonly ProductMedia[];
  readonly specification: ProductSpecification;
  /** Merchandising tags from the source catalogue. Feeds search, never display. */
  readonly tags: readonly string[];
  readonly sizeGuideId: string | null;
  /** ISO-8601. Drives "newest" sorting and the NEW badge. */
  readonly publishedAt: string | null;
  readonly legacyUrl: string | null;
  /**
   * Editorially curated ordering for the "featured" sort. Lower sorts first;
   * products without a rank fall to the end in a stable order.
   */
  readonly featuredRank: number | null;
}

export interface Collection {
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly heroMedia: ProductMedia | null;
  /** Drop/season label, e.g. "SS24" — only ever set from verified source data. */
  readonly dropLabel: string | null;
  /** ISO-8601 release date; null when the real date could not be established. */
  readonly releasedAt: string | null;
  readonly isArchived: boolean;
  readonly productSlugs: readonly string[];
  readonly legacyUrl: string | null;
}

/**
 * Size guide measurements. `value` is null when the measurement has not been
 * confirmed by the brand — the UI renders those rows as "pending" rather than
 * inventing a number a customer would order against.
 */
export interface SizeGuideMeasurement {
  readonly size: string;
  readonly value: number | null;
}

export interface SizeGuideRow {
  readonly label: string;
  readonly unit: 'cm' | 'in';
  readonly measurements: readonly SizeGuideMeasurement[];
}

export interface SizeGuide {
  readonly id: string;
  readonly name: string;
  readonly sizes: readonly string[];
  readonly rows: readonly SizeGuideRow[];
  readonly notes: string | null;
  /** True when any measurement is still unconfirmed; drives the pending notice. */
  readonly isPending: boolean;
}

export interface Campaign {
  readonly id: string;
  readonly title: string;
  readonly statement: string | null;
  readonly media: readonly ProductMedia[];
  readonly collectionSlug: string | null;
  readonly publishedAt: string | null;
}

export interface EditorialStory {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly excerpt: string | null;
  readonly body: readonly string[];
  readonly media: readonly ProductMedia[];
  readonly publishedAt: string | null;
}

/** A customer fit from the Styled By You / The Troop gallery. */
export interface UGCEntry {
  readonly id: string;
  readonly media: ProductMedia;
  /** Social handle, including the leading @. Null when not publicly credited. */
  readonly handle: string | null;
  readonly caption: string | null;
  /** Products visible in the shot, enabling shoppable UGC. */
  readonly productSlugs: readonly string[];
  readonly sourceUrl: string | null;
}

/**
 * Reviews are modelled so the surface exists, but no review is ever authored by
 * us. Until a real review pipeline lands in Phase 2 the repository returns an
 * empty list and the UI renders nothing at all.
 */
export interface CustomerReview {
  readonly id: string;
  readonly productSlug: string;
  readonly rating: 1 | 2 | 3 | 4 | 5;
  readonly title: string | null;
  readonly body: string;
  readonly authorName: string;
  readonly isVerifiedPurchase: boolean;
  readonly createdAt: string;
}

export interface CartLine {
  readonly id: string;
  readonly productSlug: string;
  readonly variantId: string;
  readonly quantity: number;
  /**
   * Denormalised for instant rendering. Treated as a cache: the cart repository
   * re-resolves against the catalog on load so a stale price never survives.
   */
  readonly productName: string;
  readonly variantTitle: string;
  readonly unitPrice: Money;
  readonly compareAtUnitPrice: Money | null;
  readonly media: ProductMedia | null;
  readonly availability: InventoryDisplayState;
}

export interface Cart {
  readonly id: string;
  readonly lines: readonly CartLine[];
  readonly currency: CurrencyCode;
  readonly subtotal: Money;
  /**
   * Shipping, tax and discounts are deliberately absent. They are computed
   * server-side at checkout in Phase 2; showing a client-side guess would be a
   * number the customer could hold us to.
   */
  readonly updatedAt: string;
}

/* ------------------------------------------------------------------ *
 * Query shapes
 * ------------------------------------------------------------------ */

export type ProductSort = 'featured' | 'newest' | 'price_asc' | 'price_desc';

export interface ProductFilters {
  readonly collections?: readonly string[];
  readonly categories?: readonly string[];
  readonly sizes?: readonly string[];
  readonly colours?: readonly string[];
  readonly minPrice?: number;
  readonly maxPrice?: number;
  readonly inStockOnly?: boolean;
}

export interface ProductQuery {
  readonly filters?: ProductFilters;
  readonly sort?: ProductSort;
  readonly limit?: number;
  readonly offset?: number;
}

/** The distinct filter values actually present in the result set. */
export interface FacetCounts {
  readonly sizes: ReadonlyArray<{ value: string; count: number }>;
  readonly colours: ReadonlyArray<{ value: string; count: number }>;
  readonly categories: ReadonlyArray<{ value: string; count: number }>;
  readonly collections: ReadonlyArray<{ value: string; count: number }>;
  readonly priceRange: { min: number; max: number } | null;
}

export interface ProductQueryResult {
  readonly products: readonly Product[];
  readonly total: number;
  readonly facets: FacetCounts;
}
