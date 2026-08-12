import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ProductGrid } from '@/components/product/ProductGrid';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { catalogRepository } from '@/data';
import { BRAND, SITE_URL } from '@/lib/site';

export const revalidate = 3600;

export async function generateStaticParams() {
  const slugs = await catalogRepository.listCollectionSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const collection = await catalogRepository.getCollectionBySlug(slug);

  if (!collection) return { title: 'Not found' };

  const description = collection.description ?? `${collection.name} from ${BRAND.name}.`;

  return {
    title: collection.name,
    description,
    alternates: { canonical: `/collections/${collection.slug}` },
    openGraph: {
      title: `${collection.name} — ${BRAND.name}`,
      description,
      url: `${SITE_URL}/collections/${collection.slug}`,
    },
  };
}

export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const collection = await catalogRepository.getCollectionBySlug(slug);

  if (!collection) notFound();

  const products = await catalogRepository.getProductsBySlugs(collection.productSlugs);

  return (
    <div>
      {collection.heroMedia && (
        <div className="relative aspect-[--aspect-campaign] max-h-[60svh] w-full overflow-hidden">
          <Image
            src={collection.heroMedia.url}
            alt={collection.heroMedia.alt}
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <div aria-hidden className="from-void absolute inset-0 bg-gradient-to-t to-transparent" />
        </div>
      )}

      <div className="edge pt-24 pb-[--spacing-section] md:pt-28">
        <nav aria-label="Breadcrumb" className="mb-8">
          <ol className="text-dim flex flex-wrap items-center gap-2 text-[0.7rem] tracking-[0.12em] uppercase">
            <li>
              <Link href="/collections" className="hover:text-bone">
                Collections
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li className="text-bone" aria-current="page">
              {collection.name}
            </li>
          </ol>
        </nav>

        <header className="mb-12 max-w-2xl">
          {collection.dropLabel && (
            <p className="text-dim mb-4 text-[0.68rem] font-semibold tracking-[0.24em] uppercase">
              {collection.dropLabel}
            </p>
          )}
          <h1 className="font-display text-headline text-paper">{collection.name}</h1>
          {collection.description && (
            <p className="text-smoke mt-5 text-sm leading-relaxed">{collection.description}</p>
          )}
          <p className="text-dim mt-4 text-[0.7rem] tracking-[0.14em] uppercase">
            {products.length} {products.length === 1 ? 'piece' : 'pieces'}
          </p>
        </header>

        {products.length > 0 ? (
          <ProductGrid products={products} density="comfortable" priorityCount={4} />
        ) : (
          <EmptyState
            title="Nothing in this collection yet"
            body="No products are currently associated with this collection."
            action={
              <ButtonLink href="/shop" variant="primary" size="md">
                Shop all
              </ButtonLink>
            }
          />
        )}
      </div>
    </div>
  );
}
