/**
 * Composition root for data access.
 *
 * Components import the repository *instances* from here and never construct an
 * adapter themselves.
 *
 * The catalogue is served by the Shopify adapter: live from the Storefront API,
 * falling back to the committed snapshot when Shopify cannot be reached. Setting
 * `SHOPIFY_LIVE_CATALOG=off` pins it to the snapshot (tests, offline builds).
 */
import { shopifyCatalogRepository } from './adapters/shopify/catalog';
import { localContentRepository, localReviewRepository } from './adapters/local/content';
import type { CatalogRepository, ContentRepository, ReviewRepository } from './repositories';

export const catalogRepository: CatalogRepository = shopifyCatalogRepository;
export const contentRepository: ContentRepository = localContentRepository;
export const reviewRepository: ReviewRepository = localReviewRepository;

export * from './repositories';
