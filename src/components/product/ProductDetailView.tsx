'use client';

/**
 * Coordinates the gallery and the buy panel.
 *
 * The product owns the page: on desktop the imagery takes the wider column and
 * scrolls, while the buy panel sticks alongside it, so a customer can look
 * through every shot without ever losing the size selector and the price. On
 * mobile the gallery runs edge to edge and the panel follows beneath it.
 *
 * This wrapper exists purely so selecting a colour can drive the gallery: the
 * panel lifts the selected variant's media id up here and the gallery consumes
 * it. Keeping it thin means the page itself stays a server component and the
 * catalogue never ships to the browser.
 */
import { useCallback, useState } from 'react';

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

  // Stable identity: the panel calls this from an effect keyed on the selected
  // variant, and a new function each render would re-fire it every render.
  const handleActiveMediaChange = useCallback((id: string | null) => setActiveMediaId(id), []);

  return (
    <div className="grid gap-10 md:grid-cols-[1.15fr_0.85fr] md:gap-12 lg:gap-20">
      <div>
        <ProductGallery media={media} productName={product.name} activeMediaId={activeMediaId} />
      </div>

      <div className="md:sticky md:top-28 md:self-start">
        <ProductPurchasePanel
          product={product}
          sizeGuide={sizeGuide}
          onActiveMediaChange={handleActiveMediaChange}
        />
      </div>
    </div>
  );
}
