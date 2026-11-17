import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Section } from '@/components/layout/Section';
import { ProductDetailView } from '@/components/product/ProductDetailView';
import { ProductRack } from '@/components/product/ProductRack';
import { catalogRepository } from '@/data';
import { fromPrice, primaryMedia, productAvailability } from '@/domain/product';
import { BRAND, SITE_URL } from '@/lib/site';
import { getSiteContent } from '@/server/cms';
import { getProductPresentation, recommendProducts } from '@/server/storefront';

/** Price and stock are live, so a product page is never more than a minute old. */
export const revalidate = 60;

/**
 * A product published in the admin after the last deployment has no pre-rendered
 * page. `dynamicParams` lets it render on first request instead of 404ing.
 */
export const dynamicParams = true;

export async function generateStaticParams() {
  const slugs = await catalogRepository.listProductSlugs();
  return slugs.map((slug) => ({ slug }));
}

const absolute = (url: string) => (url.startsWith('http') ? url : `${SITE_URL}${url}`);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await catalogRepository.getProductBySlug(slug);

  if (!product) return { title: 'Not found', robots: { index: false, follow: false } };

  const media = primaryMedia(product);
  const description =
    product.tagline ??
    product.description?.replace(/\s+/g, ' ').slice(0, 155) ??
    `${product.name} from ${BRAND.name}.`;

  return {
    title: product.name,
    description,
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: {
      type: 'website',
      title: `${product.name} — ${BRAND.name}`,
      description,
      url: `${SITE_URL}/products/${product.slug}`,
      images: media
        ? [{ url: absolute(media.url), alt: media.alt, width: media.width, height: media.height }]
        : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${product.name} — ${BRAND.name}`,
      description,
      images: media ? [absolute(media.url)] : undefined,
    },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await catalogRepository.getProductBySlug(slug);

  if (!product) notFound();

  const [{ products: catalog }, presentation, content] = await Promise.all([
    catalogRepository.listProducts(),
    getProductPresentation(product),
    getSiteContent(),
  ]);

  const recommended = content.upsell.productPage ? recommendProducts(catalog, [product], 4) : [];
  const price = fromPrice(product);
  const availability = productAvailability(product);

  /**
   * Product structured data. Only fields backed by real values are emitted —
   * no aggregateRating, since no reviews exist, and no fabricated GTIN.
   */
  const productSchema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description ?? undefined,
    image: product.media.slice(0, 6).map((media) => absolute(media.url)),
    sku: product.variants.find((variant) => variant.sku)?.sku ?? undefined,
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
      <Section surface="paper" spacing="none" className="pt-6 pb-(--spacing-section) md:pt-10">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }}
        />

        <nav aria-label="Breadcrumb" className="mb-6">
          <ol className="text-fg-faint flex flex-wrap items-center gap-2 text-[0.7rem] tracking-[0.12em] uppercase">
            <li>
              <Link href="/" className="hover:text-fg">
                Home
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li>
              <Link href="/shop" className="hover:text-fg">
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
          sizeChart={presentation.sizeChart}
          details={{ fit: presentation.fit, fabric: presentation.fabric, care: presentation.care }}
        />
      </Section>

      {recommended.length > 0 && (
        <Section
          surface="paper"
          spacing="tight"
          aria-labelledby="related-heading"
          data-testid="you-may-also-like"
          className="border-line border-t"
        >
          <h2
            id="related-heading"
            className="font-display text-headline text-fg mb-10 text-center md:mb-14"
          >
            You may also like
          </h2>
          <ProductRack products={recommended} priorityCount={0} columns={4} />
        </Section>
      )}
    </>
  );
}
