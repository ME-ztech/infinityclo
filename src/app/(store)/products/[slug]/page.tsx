import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ProductDetailView } from '@/components/product/ProductDetailView';
import { ProductRack } from '@/components/product/ProductRack';
import { Section, SectionHeader } from '@/components/layout/Section';
import { TextLink } from '@/components/ui/Button';
import { catalogRepository } from '@/data';
import {
  fromPrice,
  isSoldOut,
  primaryMedia,
  productAvailability,
  relatedProducts,
} from '@/domain/product';
import { previewOffers } from '@/domain/promotions';
import type { Product } from '@/domain/types';
import { BRAND, SITE_URL } from '@/lib/site';
import { getSettings } from '@/server/content/cms';
import { livePromotions } from '@/server/promotions';

export const revalidate = 3600;

export async function generateStaticParams() {
  const slugs = await catalogRepository.listProductSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await catalogRepository.getProductBySlug(slug);

  if (!product) return { title: 'Not found' };

  const media = primaryMedia(product);
  const description =
    product.tagline ?? product.description?.slice(0, 155) ?? `${product.name} from ${BRAND.name}.`;

  return {
    title: product.name,
    description,
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: {
      type: 'website',
      title: `${product.name} — ${BRAND.name}`,
      description,
      url: `${SITE_URL}/products/${product.slug}`,
      images: media ? [{ url: media.url, alt: media.alt }] : undefined,
    },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await catalogRepository.getProductBySlug(slug);

  if (!product) notFound();

  const [{ products: catalog }, , sizeGuide, promotions, settings] = await Promise.all([
    catalogRepository.listProducts(),
    Promise.resolve(null),
    product.sizeGuideId ? catalogRepository.getSizeGuide(product.sizeGuideId) : null,
    livePromotions(),
    getSettings(),
  ]);

  // "You may also like": only pieces a customer can actually buy right now.
  const related = settings.pdpRecommendationsEnabled
    ? relatedProducts(
        product,
        catalog.filter((candidate) => !isSoldOut(candidate)),
        4,
      )
    : [];
  const siblings = colourSiblings(product, catalog);
  const firstVariant = product.variants[0];
  const offerMessages = firstVariant
    ? previewOffers(promotions, [
        {
          productSlug: product.slug,
          quantity: 1,
          unitPrice: firstVariant.price,
          compareAtUnitPrice: firstVariant.compareAtPrice,
        },
      ])
        .filter((offer) => offer.kind !== 'percentage' || offer.qualified || offer.code)
        .map((offer) => offer.message)
    : [];
  const price = fromPrice(product);
  const availability = productAvailability(product);
  const media = primaryMedia(product);

  /**
   * Product structured data. Only fields backed by real values are emitted —
   * no aggregateRating, since no reviews exist, and no fabricated brand or GTIN.
   */
  const productSchema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description ?? undefined,
    image: media
      ? [media.url.startsWith('http') ? media.url : `${SITE_URL}${media.url}`]
      : undefined,
    brand: { '@type': 'Brand', name: BRAND.name },
    ...(price && {
      offers: {
        '@type': 'Offer',
        price: (price.amount / 100).toFixed(2),
        priceCurrency: price.currency,
        availability:
          availability === 'sold_out' || availability === 'archived'
            ? 'https://schema.org/OutOfStock'
            : 'https://schema.org/InStock',
        url: `${SITE_URL}/products/${product.slug}`,
      },
    }),
  };

  return (
    <>
      <Section surface="bone" spacing="none" className="pt-10 pb-(--spacing-section) md:pt-14">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }}
        />

        <nav aria-label="Breadcrumb" className="mb-8">
          <ol className="text-fg-faint flex flex-wrap items-center gap-2 text-[0.7rem] tracking-[0.12em] uppercase">
            <li>
              <Link href="/" className="hover:text-fg-muted">
                Home
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li>
              <Link href="/shop" className="hover:text-fg-muted">
                Shop
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li className="text-fg-muted" aria-current="page">
              {product.name}
            </li>
          </ol>
        </nav>

        <ProductDetailView
          product={product}
          sizeGuide={sizeGuide}
          offerMessages={offerMessages}
          siblings={siblings}
        />
      </Section>

      {related.length > 0 && (
        <Section surface="paper" aria-labelledby="related-heading">
          <SectionHeader
            id="related-heading"
            eyebrow="Goes with"
            title="You may also like"
            action={<TextLink href="/shop">Shop all</TextLink>}
            className="mb-10 md:mb-14"
          />
          {/* The rack rather than the grid: four related pieces in a 2-up mobile
              grid is exactly the cramped presentation 1.1 removed everywhere
              else, and a rail reads better at the foot of a long page. */}
          <ProductRack products={related} priorityCount={0} columns={4} />
        </Section>
      )}
    </>
  );
}

/**
 * Some colourways are separate Shopify products with the same title (e.g. the
 * three Varsity Hoodies). Link them as "Also in" so a customer sees every
 * colour from any one of them.
 */
function colourSiblings(product: Product, catalog: readonly Product[]) {
  return catalog
    .filter((candidate) => candidate.slug !== product.slug && candidate.name === product.name)
    .map((candidate) => {
      const colour =
        candidate.variants[0]?.selectedOptions.Color ??
        candidate.variants[0]?.selectedOptions.Colour;
      return { slug: candidate.slug, label: colour ?? candidate.slug.replace(/-/g, ' ') };
    });
}
