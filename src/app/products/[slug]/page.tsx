import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ProductDetailView } from '@/components/product/ProductDetailView';
import { ProductDetails } from '@/components/product/ProductDetails';
import { ProductGrid } from '@/components/product/ProductGrid';
import { SectionHeading } from '@/components/home/SectionHeading';
import { TroopGallery } from '@/components/troop/TroopGallery';
import { catalogRepository, contentRepository } from '@/data';
import { fromPrice, primaryMedia, productAvailability, relatedProducts } from '@/domain/product';
import { BRAND, SITE_URL } from '@/lib/site';

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

  const [{ products: catalog }, ugc, sizeGuide] = await Promise.all([
    catalogRepository.listProducts(),
    contentRepository.getUGCForProduct(product.slug),
    product.sizeGuideId ? catalogRepository.getSizeGuide(product.sizeGuideId) : null,
  ]);

  const related = relatedProducts(product, catalog, 4);
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
    image: media ? [`${SITE_URL}${media.url}`] : undefined,
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
    <div className="edge pt-24 pb-[--spacing-section] md:pt-32">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }}
      />

      <nav aria-label="Breadcrumb" className="mb-8">
        <ol className="text-dim flex flex-wrap items-center gap-2 text-[0.7rem] tracking-[0.12em] uppercase">
          <li>
            <Link href="/" className="hover:text-bone">
              Home
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li>
            <Link href="/shop" className="hover:text-bone">
              Shop
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li className="text-bone" aria-current="page">
            {product.name}
          </li>
        </ol>
      </nav>

      <ProductDetailView product={product} sizeGuide={sizeGuide} />

      <div className="mt-4 md:ml-auto md:max-w-[calc(50%-2rem)]">
        <ProductDetails product={product} />
      </div>

      {ugc.length > 0 && (
        <section className="pt-[--spacing-section]" aria-labelledby="worn-heading">
          <SectionHeading
            eyebrow="The Troop"
            title="Worn by the Troop"
            href="/troop"
            linkLabel="See more"
            className="mb-10"
          />
          <TroopGallery entries={ugc} />
        </section>
      )}

      {related.length > 0 && (
        <section className="pt-[--spacing-section]" aria-labelledby="related-heading">
          <SectionHeading title="Complete the look" href="/shop" className="mb-10" />
          <ProductGrid products={related} density="comfortable" priorityCount={0} />
        </section>
      )}
    </div>
  );
}
