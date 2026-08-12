/**
 * The verified seed catalogue.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS, AND WHY IT EXISTS
 * ────────────────────────────────────────────────────────────────────────────
 *
 * The storefront's real catalogue comes from `scripts/import-infnity-catalog.ts`,
 * which reads infinityclo.ca once at build time and writes
 * `src/data/catalog/products.json`. That import is the source of truth and it
 * always wins — see `snapshot.ts`.
 *
 * This file is the fallback for when the import cannot run. The environment the
 * 1.1 refinement was built in has infinityclo.ca and cdn.shopify.com denied by
 * its egress policy, so without this the entire storefront renders empty states
 * and none of the design work can be reviewed.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * PROVENANCE — read this before changing anything below
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Every product name, price and sale price here was transcribed from
 * screenshots of infinityclo.ca/collections/all captured by the store owner on
 * 2026-08-12 and supplied with the 1.1 brief. They are the brand's own live
 * values, read off the brand's own storefront. Nothing here is a guess at what
 * INFNITY *might* sell.
 *
 * What is deliberately ABSENT, because it could not be read from those
 * screenshots and inventing it would be inventing product data:
 *
 *   • Photography.       Not one image. Cards and galleries render the designed
 *                        no-photograph plate instead.
 *   • Sizes.             Each piece carries a single default variant. No size
 *                        run has been assumed for any garment.
 *   • Descriptions,      All null. The PDP omits those sections entirely rather
 *     materials, fit,    than printing copy the brand never wrote.
 *     care, weight.
 *   • Publish dates.     Null, so nothing is badged NEW on a date we made up.
 *
 * `featuredRank` IS set: it preserves the order the pieces actually appear in on
 * /collections/all, which is real merchandising the owner's screenshots show
 * directly.
 *
 * ONE DOCUMENTED DEVIATION: the store lists the Varsity Hoodie as three separate
 * listings at an identical name and price, distinguished only by colourway. They
 * are modelled here as one product with a Colour axis so the catalogue does not
 * show three identical cards. The values "Cream", "Black" and "Grey" describe
 * the garments visible in the screenshots — the brand's own colourway names are
 * not known and will replace these at import.
 *
 * PIECES SEEN BUT NOT SEEDED, because their price was cut off in the source
 * screenshots and a storefront must not show a price it cannot substantiate:
 * the INFNI-TEE'S LeCaptain America tee, the white graphic tee beside it, the
 * ivy-moss sweat shorts, and the sold-out black sweatpants. All four arrive with
 * the import.
 */
import type { Collection, Money, Product, ProductVariant } from '@/domain/types';

const CAD = (amount: number): Money => ({ amount, currency: 'CAD' });

interface SeedInput {
  slug: string;
  name: string;
  /** Current price in cents. */
  price: number;
  /** Compare-at price in cents, when the piece is on sale. */
  compareAt?: number;
  /** Position on /collections/all, as merchandised by the brand. */
  featuredRank: number;
  /** Only set where the live listing genuinely has a colour axis. */
  colours?: readonly string[];
}

/**
 * Order matches the storefront's own /collections/all listing, top to bottom.
 */
const SEED_INPUTS: readonly SeedInput[] = [
  { slug: 'infnitys-iced-raven-tank', name: "INFNITY'S Iced Raven Tank", price: 2999, compareAt: 6000, featuredRank: 0 },
  { slug: 'infnitys-iced-soft-blush-tank', name: "INFNITY'S Iced Soft Blush Tank", price: 2900, compareAt: 6000, featuredRank: 1 },
  { slug: 'infnitys-iced-ivory-pearl-tank', name: "INFNITY'S Iced Ivory Pearl Tank", price: 2999, compareAt: 6000, featuredRank: 2 },
  { slug: 'infnitys-reversible-obsidian-blank-hoodie', name: "INFNITY'S Reversible Obsidian Blank Hoodie", price: 6000, featuredRank: 3 },
  { slug: 'infnitys-crew-socks-pack', name: "INFNITY'S Crew Socks Pack", price: 999, featuredRank: 4 },
  { slug: 'infnitys-jet-black-jersey', name: "INFNITY'S Jet-Black Jersey", price: 5000, compareAt: 7067, featuredRank: 5 },
  { slug: 'infnitys-ivy-moss-jersey', name: "INFNITY'S Ivy Moss Jersey", price: 5000, compareAt: 7067, featuredRank: 6 },
  { slug: 'infnitys-crimson-static-jersey', name: "INFNITY'S Crimson Static Jersey", price: 5000, compareAt: 7067, featuredRank: 7 },
  {
    slug: 'infnitys-varsity-hoodie',
    name: "INFNITY'S Varsity Hoodie",
    price: 4598,
    compareAt: 6998,
    featuredRank: 8,
    colours: ['Cream', 'Black', 'Grey'],
  },
  { slug: 'infnitys-signature-ivy-moss-patchwork-hoodie', name: "INFNITY'S Signature Ivy-Moss Patchwork Hoodie", price: 7500, compareAt: 8500, featuredRank: 9 },
];

/** The one collection the seed can substantiate: the store's own full listing. */
const SEED_COLLECTION_SLUG = 'all';

function buildVariants(input: SeedInput): ProductVariant[] {
  const price = CAD(input.price);
  const compareAtPrice = input.compareAt ? CAD(input.compareAt) : null;

  if (!input.colours) {
    // Shopify's shape for a product with no option axis. The PDP renders no
    // selector and adds this variant directly, which is correct behaviour for a
    // single-variant product — not a placeholder.
    return [
      {
        id: `${input.slug}-default`,
        sku: null,
        title: 'Default Title',
        price,
        compareAtPrice,
        availability: 'in_stock',
        selectedOptions: {},
        mediaId: null,
      },
    ];
  }

  return input.colours.map((colour) => ({
    id: `${input.slug}-${colour.toLowerCase()}`,
    sku: null,
    title: colour,
    price,
    compareAtPrice,
    availability: 'in_stock',
    selectedOptions: { Colour: colour },
    mediaId: null,
  }));
}

function buildProduct(input: SeedInput): Product {
  return {
    id: `seed-${input.slug}`,
    slug: input.slug,
    name: input.name,
    tagline: null,
    description: null,
    // Left null on purpose: the garment type is derived at render time by
    // `domain/taxonomy`, which reads the product's own name. Writing a category
    // here would be asserting a merchandising label the brand did not set.
    category: null,
    collectionSlugs: [SEED_COLLECTION_SLUG],
    options: input.colours
      ? [{ id: `${input.slug}-option-colour`, name: 'Colour', position: 1, values: input.colours }]
      : [],
    variants: buildVariants(input),
    media: [],
    specification: {
      materials: null,
      fit: null,
      care: null,
      construction: null,
      weightGsm: null,
      countryOfOrigin: null,
      modelInfo: null,
    },
    tags: [],
    sizeGuideId: null,
    publishedAt: null,
    legacyUrl: null,
    featuredRank: input.featuredRank,
  };
}

export const seedProducts: readonly Product[] = SEED_INPUTS.map(buildProduct);

export const seedCollections: readonly Collection[] = [
  {
    slug: SEED_COLLECTION_SLUG,
    name: 'All Pieces',
    description: null,
    heroMedia: null,
    dropLabel: null,
    releasedAt: null,
    isArchived: false,
    productSlugs: seedProducts.map((product) => product.slug),
    legacyUrl: 'https://infinityclo.ca/collections/all',
  },
];
