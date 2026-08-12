import type { Campaign, CustomerReview, EditorialStory, UGCEntry } from '@/domain/types';
import type { ContentRepository, ReviewRepository } from '@/data/repositories';

import { campaigns, editorialStories, ugcEntries } from './snapshot';

export class LocalContentRepository implements ContentRepository {
  async listCampaigns(): Promise<readonly Campaign[]> {
    return campaigns;
  }

  async getCampaign(id: string): Promise<Campaign | null> {
    return campaigns.find((campaign) => campaign.id === id) ?? null;
  }

  async listEditorialStories(): Promise<readonly EditorialStory[]> {
    return [...editorialStories].sort((a, b) => {
      const at = a.publishedAt ? Date.parse(a.publishedAt) : 0;
      const bt = b.publishedAt ? Date.parse(b.publishedAt) : 0;
      return bt - at;
    });
  }

  async getEditorialStory(slug: string): Promise<EditorialStory | null> {
    return editorialStories.find((story) => story.slug === slug) ?? null;
  }

  async listUGC(limit?: number): Promise<readonly UGCEntry[]> {
    return limit ? ugcEntries.slice(0, limit) : ugcEntries;
  }

  async getUGCForProduct(productSlug: string): Promise<readonly UGCEntry[]> {
    return ugcEntries.filter((entry) => entry.productSlugs.includes(productSlug));
  }
}

/**
 * No review data exists and none will be fabricated. This adapter returns an
 * empty list so the PDP omits the review section entirely; a Phase 2 adapter
 * backed by real verified-purchase reviews replaces it without UI changes.
 */
export class LocalReviewRepository implements ReviewRepository {
  async listReviewsForProduct(_productSlug: string): Promise<readonly CustomerReview[]> {
    return [];
  }
}

export const localContentRepository = new LocalContentRepository();
export const localReviewRepository = new LocalReviewRepository();
