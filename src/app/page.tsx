import { Hero } from '@/components/home/Hero';
import {
  CommunitySection,
  ComingSoonSection,
  FeaturedSection,
  LookbookSection,
  NewsletterSection,
  StatementSection,
  VaultSection,
} from '@/components/home/HomeSections';
import { catalogRepository } from '@/data';
import type { HomepageSectionKey } from '@/domain/cms';
import { isSoldOut } from '@/domain/product';
import type { Product } from '@/domain/types';
import { approvedPosts } from '@/server/community';
import { getCms } from '@/server/content/cms';
import { publicTeasers } from '@/server/drops';

export const revalidate = 300;

/**
 * Homepage, in the order the brief sets and the owner can reorder in
 * Admin → Content → Homepage: hero, brand statement, featured drop, Enter the
 * Vault, lookbook, Styled By You, coming soon, newsletter. Footer follows.
 */
export default async function HomePage() {
  const [hero, homepage, lookbook, everything, posts, teasers] = await Promise.all([
    getCms('hero'),
    getCms('homepage'),
    getCms('lookbook'),
    catalogRepository.listProducts({ sort: 'newest' }),
    approvedPosts(12),
    publicTeasers(),
  ]);

  const featured = await featuredProducts(homepage.value.featured, everything.products);

  const render: Record<HomepageSectionKey, React.ReactNode> = {
    statement: <StatementSection key="statement" content={homepage.value.statement} />,
    featured: <FeaturedSection key="featured" title={homepage.value.featured.title} products={featured} />,
    vault: <VaultSection key="vault" content={homepage.value.vault} productCount={everything.total} />,
    lookbook: <LookbookSection key="lookbook" content={lookbook.value} />,
    community: <CommunitySection key="community" posts={posts} />,
    coming_soon: <ComingSoonSection key="coming_soon" drop={teasers[0] ?? null} />,
    newsletter: <NewsletterSection key="newsletter" content={homepage.value.newsletter} />,
  };

  return (
    <>
      <Hero content={hero.value} />
      {homepage.value.sections.filter((section) => section.enabled).map((section) => render[section.key])}
    </>
  );
}

async function featuredProducts(
  config: { productHandles: string[]; limit: number },
  newest: readonly Product[],
): Promise<readonly Product[]> {
  if (config.productHandles.length > 0) {
    return catalogRepository.getProductsBySlugs(config.productHandles);
  }
  // Default: the newest pieces that can actually be bought.
  return newest.filter((product) => !isSoldOut(product)).slice(0, config.limit);
}
