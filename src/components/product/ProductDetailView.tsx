'use client';

/**
 * Coordinates the gallery and the buy panel.
 *
 * Exists purely so selecting a colour can drive the gallery: the panel lifts the
 * selected variant's media id up here, and the gallery consumes it. Keeping this
 * wrapper thin means the page itself stays a server component and the catalog
 * never ships to the browser.
 */
import { useState } from 'react';

import { ProductGallery } from '@/components/product/ProductGallery';
import { ProductPurchasePanel } from '@/components/product/ProductPurchasePanel';
import { orderedMedia } from '@/domain/product';
import type { Product, SizeGuide } from '@/domain/types';

export function ProductDetailView({
  product,
  sizeGuide,
}: {
  product: Product;
  sizeGuide: SizeGuide | null;
}) {
  const [activeMediaId, setActiveMediaId] = useState<string | null>(null);
  const media = orderedMedia(product);

  return (
    <div className="grid gap-8 md:grid-cols-2 md:gap-12 lg:gap-16">
      <div className="md:sticky md:top-24 md:self-start">
        <ProductGallery media={media} productName={product.name} activeMediaId={activeMediaId} />
      </div>

      <div>
        <ProductPurchasePanel
          product={product}
          sizeGuide={sizeGuide}
          onActiveMediaChange={setActiveMediaId}
        />
      </div>
    </div>
  );
}
