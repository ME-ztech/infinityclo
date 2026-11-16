/**
 * Storefront content — everything the owner can change without a deployment.
 *
 * One document (`content/site`) holds the homepage: hero slides, statement,
 * section order, featured products, lookbook, community and newsletter copy,
 * the announcement bar, upsell switches and public contact details.
 *
 * Defaults are built only from material that exists: the brand's own lines
 * ("Be the Statement", "Enter the Vault", "Styled By You", the store
 * description) and photographs already in the imported catalogue. Where no
 * authentic asset exists the default is empty and the section does not render.
 */
import 'server-only';

import { products as snapshotProducts } from '@/data/adapters/local/snapshot';
import type { Product } from '@/domain/types';

import { getStore } from './store';

export interface ContentImage {
  readonly url: string;
  readonly alt: string;
  readonly width: number;
  readonly height: number;
}

export interface HeroSlide {
  readonly id: string;
  readonly enabled: boolean;
  /** One to three images. Mobile shows the first; desktop composes all of them. */
  readonly images: readonly ContentImage[];
  /** Focal point as percentages, used for `object-position` when cropping. */
  readonly focalPoint: { readonly x: number; readonly y: number };
  /** 0–80. Darkening applied over the photography for text contrast. */
  readonly overlay: number;
  /** Text colour over the slide. */
  readonly tone: 'light' | 'dark';
  readonly eyebrow: string;
  readonly title: string;
  readonly ctaLabel: string;
  readonly ctaHref: string;
}

export const HOMEPAGE_SECTIONS = [
  'hero',
  'statement',
  'featured',
  'vault',
  'lookbook',
  'community',
  'coming-soon',
  'newsletter',
] as const;

export type HomepageSectionId = (typeof HOMEPAGE_SECTIONS)[number];

export const SECTION_LABELS: Record<HomepageSectionId, string> = {
  hero: 'Campaign hero',
  statement: 'Brand statement',
  featured: 'Featured / new drop',
  vault: 'Enter the Vault',
  lookbook: 'Lookbook',
  community: 'Styled By You',
  'coming-soon': 'Coming soon / waitlist',
  newsletter: 'Newsletter',
};

export interface SiteContent {
  readonly announcement: { readonly enabled: boolean; readonly text: string; readonly href: string };
  readonly hero: { readonly autoAdvanceSeconds: number; readonly slides: readonly HeroSlide[] };
  readonly statement: { readonly headline: string; readonly body: string };
  readonly sections: ReadonlyArray<{ readonly id: HomepageSectionId; readonly enabled: boolean }>;
  readonly featured: { readonly heading: string; readonly productSlugs: readonly string[] };
  readonly vault: { readonly heading: string; readonly body: string; readonly ctaLabel: string };
  readonly lookbook: {
    readonly heading: string;
    readonly body: string;
    readonly images: ReadonlyArray<ContentImage & { readonly productSlug: string | null }>;
  };
  readonly community: { readonly heading: string; readonly body: string };
  readonly newsletter: { readonly heading: string; readonly body: string };
  /** "You may also like" placements. The cart placement is off by default. */
  readonly upsell: { readonly productPage: boolean; readonly cart: boolean };
  readonly social: { readonly instagram: string; readonly facebook: string; readonly threads: string };
  readonly contact: { readonly email: string; readonly note: string };
  readonly updatedAt: string | null;
  readonly updatedBy: string | null;
}

const imageOf = (product: Product | undefined, index = 0): ContentImage | null => {
  const media = product?.media[index];
  if (!media) return null;
  return { url: media.url, alt: media.alt, width: media.width, height: media.height };
};

const bySlug = (slug: string) => snapshotProducts.find((product) => product.slug === slug);

function slide(
  id: string,
  slugs: readonly string[],
  copy: Pick<HeroSlide, 'eyebrow' | 'title' | 'ctaLabel' | 'ctaHref'>,
): HeroSlide | null {
  const images = slugs.map((slug) => imageOf(bySlug(slug))).filter((image): image is ContentImage => image !== null);
  if (images.length === 0) return null;
  return { id, enabled: true, images, focalPoint: { x: 50, y: 22 }, overlay: 0, tone: 'dark', ...copy };
}

/**
 * The default homepage. Every image is a brand studio photograph from the
 * imported catalogue; a slide whose products are missing is dropped rather than
 * padded.
 */
export function defaultContent(): SiteContent {
  const slides = [
    slide('slide-statement', ['infnitys-iced-raven-tank', 'infnitys-iced-ivory-pearl-tank', 'infnitys-iced-soft-blush-tank'], {
      eyebrow: 'INFNITY',
      title: 'Be the Statement',
      ctaLabel: 'Shop now',
      ctaHref: '/shop',
    }),
    slide('slide-vault', ['infnitys-obsidian-jersey', 'infnitys-crimson-static-jersey', 'infnitys-crimson-static-jersey-copy'], {
      eyebrow: 'The full catalogue',
      title: 'Enter the Vault',
      ctaLabel: 'Enter the Vault',
      ctaHref: '/shop',
    }),
    slide('slide-troop', ['infni-tees-lecaptain-america', 'infnitys-mpnw-sleeved-shirt', 'infni-tees-chaos'], {
      eyebrow: 'The Troop in INFNITY',
      title: 'Styled By You',
      ctaLabel: 'See the wall',
      ctaHref: '/community',
    }),
  ].filter((entry): entry is HeroSlide => entry !== null);

  const lookbookSlugs = [
    'infnitys-reversible-hoodie',
    'infnitys-reversible-obsidian-blank-hoodie',
    'infnitys-stellar-ops-camo-jorts',
    'infnitys-stellar-ops-camo-jorts-copy',
    'infnitys-iced-soft-blush-tank',
    'infnitys-obsidian-jersey',
  ];
  const lookbook = lookbookSlugs
    .map((slug) => {
      const product = bySlug(slug);
      const image = imageOf(product, product && product.media.length > 1 ? 1 : 0);
      return image ? { ...image, productSlug: slug } : null;
    })
    .filter((entry): entry is ContentImage & { productSlug: string } => entry !== null);

  return {
    announcement: { enabled: false, text: '', href: '' },
    hero: { autoAdvanceSeconds: 6, slides },
    statement: {
      headline: 'Be the Statement',
      body: 'INFNITY is where raw identity meets untouchable design. Built for the ones who don’t fold, don’t follow — and never settle. For the FLY only.',
    },
    sections: HOMEPAGE_SECTIONS.map((id) => ({ id, enabled: true })),
    featured: { heading: 'The latest drop', productSlugs: [] },
    vault: {
      heading: 'Enter the Vault',
      body: 'Every piece, every colourway, in one place.',
      ctaLabel: 'Enter the Vault',
    },
    lookbook: { heading: 'Lookbook', body: '', images: lookbook },
    community: {
      heading: 'Styled By You',
      body: 'The Troop in INFNITY. Wanna be added to the wall? Post and tag us @infnity.clo.',
    },
    newsletter: {
      heading: 'Join the Troop',
      body: 'Early access to the next drop. Email only, unsubscribe any time.',
    },
    upsell: { productPage: true, cart: false },
    social: {
      instagram: 'https://www.instagram.com/infnity.clo/',
      facebook: '',
      threads: '',
    },
    contact: { email: '', note: 'For returns and order questions, message us on Instagram @infnity.clo.' },
    updatedAt: null,
    updatedBy: null,
  };
}

const text = (value: unknown, fallback: string, max: number): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : fallback;

const bool = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback);

const clamp = (value: unknown, min: number, max: number, fallback: number): number => {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
};

/**
 * Internal paths and https links only. Rejects `javascript:` and
 * protocol-relative URLs so admin-entered links cannot become an injection or
 * open-redirect vector.
 */
export function safeHref(value: unknown, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  const href = value.trim();
  if (/^\/(?!\/)[^\s]*$/.test(href)) return href.slice(0, 300);
  if (/^https:\/\/[^\s]+$/i.test(href)) return href.slice(0, 300);
  return fallback;
}

/** Images must be served from this origin or the store's own Shopify CDN. */
export function safeImageUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const url = value.trim();
  if (/^\/(?!\/)[\w./-]+\.(?:jpe?g|png|webp|avif)$/i.test(url)) return url;
  if (/^https:\/\/cdn\.shopify\.com\/[^\s"'<>]+$/i.test(url)) return url;
  return null;
}

function image(value: unknown): ContentImage | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const url = safeImageUrl(record.url);
  if (!url) return null;
  return {
    url,
    alt: text(record.alt, '', 200),
    width: clamp(record.width, 1, 10000, 1600),
    height: clamp(record.height, 1, 10000, 1600),
  };
}

/**
 * Coerces untrusted input (a stored document, or an admin form post) into a
 * valid `SiteContent`. Unknown fields are dropped and every field is bounded, so
 * a malformed document can degrade a section but can never break the page.
 */
export function normaliseContent(input: unknown, base: SiteContent = defaultContent()): SiteContent {
  const source = (input && typeof input === 'object' ? input : {}) as Record<string, any>;

  const slides: HeroSlide[] = Array.isArray(source.hero?.slides)
    ? source.hero.slides
        .slice(0, 5)
        .map((entry: any, index: number): HeroSlide | null => {
          const images = (Array.isArray(entry?.images) ? entry.images : [])
            .slice(0, 3)
            .map(image)
            .filter((item: ContentImage | null): item is ContentImage => item !== null);
          if (images.length === 0) return null;
          return {
            id: text(entry.id, `slide-${index + 1}`, 60) || `slide-${index + 1}`,
            enabled: bool(entry.enabled, true),
            images,
            focalPoint: { x: clamp(entry.focalPoint?.x, 0, 100, 50), y: clamp(entry.focalPoint?.y, 0, 100, 22) },
            overlay: clamp(entry.overlay, 0, 80, 0),
            tone: entry.tone === 'light' ? 'light' : 'dark',
            eyebrow: text(entry.eyebrow, '', 60),
            title: text(entry.title, '', 80),
            ctaLabel: text(entry.ctaLabel, '', 40),
            ctaHref: safeHref(entry.ctaHref, '/shop'),
          };
        })
        .filter((entry: HeroSlide | null): entry is HeroSlide => entry !== null)
    : [...base.hero.slides];

  const requested: Array<{ id: HomepageSectionId; enabled: boolean }> = Array.isArray(source.sections)
    ? source.sections
        .filter((entry: any) => HOMEPAGE_SECTIONS.includes(entry?.id))
        .map((entry: any) => ({ id: entry.id as HomepageSectionId, enabled: bool(entry.enabled, true) }))
    : [];
  const seen = new Set<HomepageSectionId>();
  const sections = [...requested, ...base.sections].filter((entry) =>
    seen.has(entry.id) ? false : (seen.add(entry.id), true),
  );

  return {
    announcement: {
      enabled: bool(source.announcement?.enabled, base.announcement.enabled),
      text: text(source.announcement?.text, base.announcement.text, 140),
      href: safeHref(source.announcement?.href, ''),
    },
    hero: {
      autoAdvanceSeconds: clamp(source.hero?.autoAdvanceSeconds, 0, 20, base.hero.autoAdvanceSeconds),
      slides,
    },
    statement: {
      headline: text(source.statement?.headline, base.statement.headline, 80),
      body: text(source.statement?.body, base.statement.body, 500),
    },
    sections,
    featured: {
      heading: text(source.featured?.heading, base.featured.heading, 60),
      productSlugs: Array.isArray(source.featured?.productSlugs)
        ? source.featured.productSlugs.filter((slug: unknown) => typeof slug === 'string' && /^[a-z0-9-]+$/.test(slug)).slice(0, 12)
        : [...base.featured.productSlugs],
    },
    vault: {
      heading: text(source.vault?.heading, base.vault.heading, 60),
      body: text(source.vault?.body, base.vault.body, 240),
      ctaLabel: text(source.vault?.ctaLabel, base.vault.ctaLabel, 40),
    },
    lookbook: {
      heading: text(source.lookbook?.heading, base.lookbook.heading, 60),
      body: text(source.lookbook?.body, base.lookbook.body, 300),
      images: Array.isArray(source.lookbook?.images)
        ? source.lookbook.images
            .slice(0, 12)
            .map((entry: any) => {
              const item = image(entry);
              const slug = typeof entry?.productSlug === 'string' && /^[a-z0-9-]+$/.test(entry.productSlug) ? entry.productSlug : null;
              return item ? { ...item, productSlug: slug } : null;
            })
            .filter((entry: unknown) => entry !== null)
        : [...base.lookbook.images],
    },
    community: {
      heading: text(source.community?.heading, base.community.heading, 60),
      body: text(source.community?.body, base.community.body, 300),
    },
    newsletter: {
      heading: text(source.newsletter?.heading, base.newsletter.heading, 60),
      body: text(source.newsletter?.body, base.newsletter.body, 300),
    },
    upsell: {
      productPage: bool(source.upsell?.productPage, base.upsell.productPage),
      cart: bool(source.upsell?.cart, base.upsell.cart),
    },
    social: {
      instagram: safeHref(source.social?.instagram, base.social.instagram),
      facebook: safeHref(source.social?.facebook, base.social.facebook),
      threads: safeHref(source.social?.threads, base.social.threads),
    },
    contact: {
      email: text(source.contact?.email, base.contact.email, 254),
      note: text(source.contact?.note, base.contact.note, 300),
    },
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : null,
    updatedBy: typeof source.updatedBy === 'string' ? source.updatedBy : null,
  };
}

export async function getSiteContent(): Promise<SiteContent> {
  try {
    const stored = await getStore().get<unknown>('content', 'site');
    return stored ? normaliseContent(stored) : defaultContent();
  } catch (error) {
    console.warn(`[cms] could not read stored content, serving defaults: ${(error as Error).message}`);
    return defaultContent();
  }
}

export async function saveSiteContent(input: unknown, actor: string): Promise<SiteContent> {
  const content = { ...normaliseContent(input), updatedAt: new Date().toISOString(), updatedBy: actor };
  await getStore().put('content', 'site', content);
  return content;
}

/* ------------------------------------------------------------------ *
 * Product content — admin-editable PDP sections
 * ------------------------------------------------------------------ */

/**
 * Per-product editorial content Shopify has no field for. `null` means "not
 * confirmed": the section is omitted rather than filled with a guess.
 */
export interface ProductContent {
  readonly slug: string;
  readonly fit: string | null;
  readonly fabric: string | null;
  readonly care: string | null;
  readonly sizeChart: SizeChartId | null;
  readonly updatedAt: string;
  readonly updatedBy: string;
}

export const SIZE_CHART_IDS = ['tee', 'pullover-hoodie', 'zip-hoodie', 'bottoms'] as const;
export type SizeChartId = (typeof SIZE_CHART_IDS)[number];

export async function getProductContent(slug: string): Promise<ProductContent | null> {
  try {
    return await getStore().get<ProductContent>('product-content', slug);
  } catch {
    return null;
  }
}

export async function saveProductContent(
  slug: string,
  input: Record<string, unknown>,
  actor: string,
): Promise<ProductContent> {
  const optional = (value: unknown): string | null => text(value, '', 1200) || null;
  const chart = SIZE_CHART_IDS.includes(input.sizeChart as SizeChartId) ? (input.sizeChart as SizeChartId) : null;
  const content: ProductContent = {
    slug,
    fit: optional(input.fit),
    fabric: optional(input.fabric),
    care: optional(input.care),
    sizeChart: chart,
    updatedAt: new Date().toISOString(),
    updatedBy: actor,
  };
  await getStore().put('product-content', slug, content);
  return content;
}
