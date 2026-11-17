import 'server-only';

import { catalogRepository } from '@/data';
import sizeGuides from '@/data/catalog/size-guides.json';
import { getShopInfo } from '@/server/shopify/admin';

/** Options for the product editor: channels, stock locations, size guides and existing CDN images. */
export async function editorContext() {
  const [shop, { products }] = await Promise.all([getShopInfo(), catalogRepository.listProducts()]);
  return {
    publications: shop.publications.nodes,
    locations: shop.locations.nodes.filter((location) => location.isActive),
    sizeGuides: (sizeGuides as Array<{ id: string; name: string }>).map(({ id, name }) => ({ id, name })),
    imageSuggestions: [...new Set(products.flatMap((product) => product.media.map((media) => media.url)))].slice(0, 200),
  };
}
