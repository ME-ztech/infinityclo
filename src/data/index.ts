/**
 * Composition root for data access.
 *
 * Components import the repository *instances* from here and never construct an
 * adapter themselves. The catalogue comes from the live Shopify Storefront API
 * when a Storefront token is configured, and from the imported snapshot of the
 * live store otherwise (see docs/architecture-decision.md §6).
 */
import { shopifyCatalogRepository } from './adapters/shopify/catalog';
import { localCatalogRepository } from './adapters/local/catalog';
import { localContentRepository, localReviewRepository } from './adapters/local/content';
import type { CatalogRepository, ContentRepository, ReviewRepository } from './repositories';

const storefrontConfigured = Boolean(
  process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN || process.env.SHOPIFY_STOREFRONT_PRIVATE_TOKEN,
);

export const catalogRepository: CatalogRepository = storefrontConfigured
  ? shopifyCatalogRepository
  : localCatalogRepository;
export const contentRepository: ContentRepository = localContentRepository;
export const reviewRepository: ReviewRepository = localReviewRepository;

export type CatalogSourceKind = 'shopify-storefront' | 'snapshot';
export const catalogSourceKind: CatalogSourceKind = storefrontConfigured
  ? 'shopify-storefront'
  : 'snapshot';

export * from './repositories';
