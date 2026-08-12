/**
 * Repository interfaces — the seam between the storefront and its data source.
 *
 * Everything the UI knows about data access is declared here. The local
 * adapters in `src/data/adapters/local` satisfy these contracts from an
 * imported JSON snapshot; Phase 2 adds PostgreSQL/API adapters that satisfy the
 * same contracts. If a change to the backend requires editing a component, this
 * boundary has been violated.
 *
 * Every method is async even where the local implementation is synchronous.
 * That is deliberate: a synchronous signature here would bake an assumption
 * about locality into every call site and break the moment data moves
 * over a network.
 */
import type {
  Campaign,
  Cart,
  Collection,
  CustomerReview,
  EditorialStory,
  Product,
  ProductQuery,
  ProductQueryResult,
  SizeGuide,
  UGCEntry,
} from '@/domain/types';

export interface CatalogRepository {
  listProducts(query?: ProductQuery): Promise<ProductQueryResult>;
  getProductBySlug(slug: string): Promise<Product | null>;
  getProductsBySlugs(slugs: readonly string[]): Promise<readonly Product[]>;
  listCollections(): Promise<readonly Collection[]>;
  getCollectionBySlug(slug: string): Promise<Collection | null>;
  searchProducts(term: string, limit?: number): Promise<readonly Product[]>;
  getSizeGuide(id: string): Promise<SizeGuide | null>;
  /** Slugs for `generateStaticParams`, so routes can be pre-rendered. */
  listProductSlugs(): Promise<readonly string[]>;
  listCollectionSlugs(): Promise<readonly string[]>;
}

export interface ContentRepository {
  listCampaigns(): Promise<readonly Campaign[]>;
  getCampaign(id: string): Promise<Campaign | null>;
  listEditorialStories(): Promise<readonly EditorialStory[]>;
  getEditorialStory(slug: string): Promise<EditorialStory | null>;
  listUGC(limit?: number): Promise<readonly UGCEntry[]>;
  getUGCForProduct(productSlug: string): Promise<readonly UGCEntry[]>;
}

/**
 * Reviews have a repository so the PDP can be wired for them, but no adapter
 * fabricates entries. The local adapter returns `[]` and the UI renders no
 * review section at all — an empty state here would advertise a feature that
 * does not exist.
 */
export interface ReviewRepository {
  listReviewsForProduct(productSlug: string): Promise<readonly CustomerReview[]>;
}

/**
 * Cart persistence. The local adapter writes to `localStorage`; the Phase 2
 * adapter will write to a server-owned cart keyed by session. `addLine` takes a
 * variant id rather than a price, so the price is always resolved from the
 * catalog and can never be set by the client.
 */
export interface CartRepository {
  getCart(): Promise<Cart>;
  addLine(input: { productSlug: string; variantId: string; quantity: number }): Promise<Cart>;
  updateLineQuantity(lineId: string, quantity: number): Promise<Cart>;
  removeLine(lineId: string): Promise<Cart>;
  clear(): Promise<Cart>;
}

/**
 * Customer and order repositories are declared but intentionally unimplemented
 * in Phase 1. They exist so `/account` is designed against a real contract
 * rather than a placeholder, and so the shape of Phase 2 is already visible.
 * The local adapters throw `NotImplementedError`, and the account routes render
 * an honest "not yet available" surface instead of calling them.
 */
export interface CustomerRepository {
  getCurrentCustomer(): Promise<never>;
  signIn(email: string, password: string): Promise<never>;
  signOut(): Promise<never>;
}

export interface OrderRepository {
  listOrders(): Promise<never>;
  getOrder(id: string): Promise<never>;
}

export class NotImplementedError extends Error {
  constructor(feature: string) {
    super(`${feature} is not available until the Phase 2 commerce backend lands.`);
    this.name = 'NotImplementedError';
  }
}
