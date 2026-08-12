/**
 * Composition root for data access.
 *
 * Components import the repository *instances* from here and never construct an
 * adapter themselves. Swapping in the Phase 2 PostgreSQL adapters is a change
 * to this file alone.
 */
import { localCatalogRepository } from './adapters/local/catalog';
import { localContentRepository, localReviewRepository } from './adapters/local/content';
import type { CatalogRepository, ContentRepository, ReviewRepository } from './repositories';

export const catalogRepository: CatalogRepository = localCatalogRepository;
export const contentRepository: ContentRepository = localContentRepository;
export const reviewRepository: ReviewRepository = localReviewRepository;

export * from './repositories';
