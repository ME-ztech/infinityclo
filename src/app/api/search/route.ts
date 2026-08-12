/**
 * Storefront search.
 *
 * Backed by the catalog repository, so replacing in-process scoring with a
 * search service in Phase 2 is a change to the adapter, not to this route or to
 * any component that calls it.
 */
import { NextResponse } from 'next/server';

import { catalogRepository } from '@/data';
import { fromPrice, primaryMedia, productAvailability } from '@/domain/product';

const MAX_RESULTS = 8;

export async function GET(request: Request): Promise<NextResponse> {
  const term = new URL(request.url).searchParams.get('q')?.trim() ?? '';

  if (term.length < 2) {
    return NextResponse.json({ results: [], term });
  }

  const products = await catalogRepository.searchProducts(term, MAX_RESULTS);

  // A trimmed projection: the overlay needs a thumbnail, a name and a price,
  // not whole product records.
  const results = products.map((product) => {
    const media = primaryMedia(product);
    return {
      slug: product.slug,
      name: product.name,
      category: product.category,
      price: fromPrice(product),
      availability: productAvailability(product),
      image: media ? { url: media.url, alt: media.alt } : null,
    };
  });

  return NextResponse.json({ results, term });
}
