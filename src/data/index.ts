/**
 * Composition root for data access.
 *
 * Components import the repository *instances* from here and never construct an
 * adapter themselves. The catalogue is served from INFNITY's own database
 * (`adapters/database/catalog.ts`), with the committed snapshot as a read-only
 * fallback when no database is configured.
 */
import { databaseCatalogRepository } from './adapters/database/catalog';
import { localContentRepository, localReviewRepository } from './adapters/local/content';
import type { CatalogRepository, ContentRepository, ReviewRepository } from './repositories';

export const catalogRepository: CatalogRepository = databaseCatalogRepository;
export const contentRepository: ContentRepository = localContentRepository;
export const reviewRepository: ReviewRepository = localReviewRepository;

export * from './repositories';
