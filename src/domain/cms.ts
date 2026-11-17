/**
 * CMS documents — homepage, hero, announcement bar, lookbook, story.
 *
 * Owner-editable in Admin → Content without a deployment. Each document is a
 * versioned JSON value validated by these schemas on every save and every read,
 * so a malformed edit can never take the homepage down: an invalid stored value
 * falls back to the defaults below.
 *
 * Defaults use only verified material: the brand's own copy from infinityclo.ca
 * and the brand's own product photography on its Shopify CDN.
 */
import { z } from 'zod';

const CDN = 'https://cdn.shopify.com/s/files/1/0605/7069/7948/files';

/** Relative paths, or https URLs on hosts the image optimiser is allowed to fetch. */
export const ALLOWED_IMAGE_HOSTS = ['cdn.shopify.com', 'infinityclo.ca'] as const;

export const imageUrlSchema = z
  .string()
  .trim()
  .max(600)
  .refine((value) => {
    if (value.startsWith('/') && !value.startsWith('//')) return true;
    try {
      const url = new URL(value);
      return (
        url.protocol === 'https:' &&
        (ALLOWED_IMAGE_HOSTS as readonly string[]).includes(url.hostname)
      );
    } catch {
      return false;
    }
  }, 'Use an image uploaded to Shopify (cdn.shopify.com) or a path on this site.');

export const linkSchema = z
  .string()
  .trim()
  .max(300)
  .refine(
    (value) => (value.startsWith('/') && !value.startsWith('//')) || /^https:\/\//.test(value),
    'Use a path like /shop or a full https:// link.',
  );

const text = (max: number) => z.string().trim().max(max);

/* ------------------------------------------------------------------ *
 * Hero
 * ------------------------------------------------------------------ */

export const heroImageSchema = z.object({
  url: imageUrlSchema,
  alt: text(160).min(3, 'Describe the photograph for screen readers.'),
  /** Focal point, 0–100 %, used for object-position so crops keep the subject. */
  focalX: z.number().min(0).max(100).default(50),
  focalY: z.number().min(0).max(100).default(30),
});

export const heroSlideSchema = z.object({
  id: text(40).min(1),
  /** Short label in the bottom-left stacked list (the "Styled by community" slideshow line). */
  label: text(40).min(1),
  headline: text(80).default(''),
  /** 1–3 images: a lineup on wide screens; the first is the phone composition. */
  images: z.array(heroImageSchema).min(1).max(3),
  /** Optional dedicated phone image; otherwise images[0]. */
  mobileImage: heroImageSchema.nullable().default(null),
  /** Light photographs get dark type; dark photographs get light type. */
  tone: z.enum(['light', 'dark']).default('light'),
  /** 0–80 % scrim strength behind the copy. */
  overlay: z.number().min(0).max(80).default(0),
  ctaLabel: text(30).min(1),
  ctaHref: linkSchema,
});

export const heroSchema = z.object({
  slogan: text(60).default('Be the Statement'),
  secondaryCtaLabel: text(30).default('Styled by community'),
  secondaryCtaHref: linkSchema.default('/styled-by-you'),
  autoplay: z.boolean().default(true),
  intervalSeconds: z.number().int().min(4).max(15).default(6),
  slides: z.array(heroSlideSchema).min(1).max(5),
});
export type HeroContent = z.infer<typeof heroSchema>;
export type HeroSlide = z.infer<typeof heroSlideSchema>;

export const DEFAULT_HERO: HeroContent = {
  slogan: 'Be the Statement',
  secondaryCtaLabel: 'Styled by community',
  secondaryCtaHref: '/styled-by-you',
  autoplay: true,
  intervalSeconds: 6,
  slides: [
    {
      id: 'iced-tanks',
      label: 'Iced tanks',
      headline: 'Rhinestone on rib. Pre-made, ready to ship.',
      images: [
        {
          url: `${CDN}/RIRI-1.jpg`,
          alt: "Model wearing INFNITY's Iced Raven Tank with camo trousers",
          focalX: 50,
          focalY: 30,
        },
        {
          url: `${CDN}/SHAN-1.jpg`,
          alt: "Model wearing INFNITY's Iced Soft Blush Tank with jeans",
          focalX: 50,
          focalY: 30,
        },
        {
          url: `${CDN}/SUM-1.jpg`,
          alt: "Model wearing INFNITY's Iced Ivory Pearl Tank with camo trousers",
          focalX: 50,
          focalY: 30,
        },
      ],
      mobileImage: null,
      tone: 'light',
      overlay: 0,
      ctaLabel: 'Shop now',
      ctaHref: '/shop?group=tops',
    },
    {
      id: 'reversible-blanks',
      label: 'Reversible blanks',
      headline: '450 gsm French terry. Two ways to wear it.',
      images: [
        {
          url: `${CDN}/fiji-2.jpg`,
          alt: "Model wearing INFNITY's Reversible Obsidian Blank Hoodie, graphic side out",
          focalX: 50,
          focalY: 30,
        },
        {
          url: `${CDN}/kalia-1_cc0be1e3-04d3-453b-a9f3-2b533b90989e.jpg`,
          alt: "Model wearing INFNITY's Reversible Graphite Blank Hoodie",
          focalX: 50,
          focalY: 30,
        },
        {
          url: `${CDN}/fiji-4.jpg`,
          alt: "Back view of INFNITY's Reversible Obsidian Blank Hoodie",
          focalX: 50,
          focalY: 30,
        },
      ],
      mobileImage: null,
      tone: 'light',
      overlay: 0,
      ctaLabel: 'Shop hoodies',
      ctaHref: '/shop?group=hoodies',
    },
    {
      id: 'athletics-jerseys',
      label: 'Infinity athletics',
      headline: '260 gsm mesh jerseys. Number 44 on the back.',
      images: [
        {
          url: `${CDN}/jet-black-2_abbb039b-98dc-49c8-8c3e-7e0f09e92c35.jpg`,
          alt: "Model wearing INFNITY's Jet-Black Jersey",
          focalX: 50,
          focalY: 30,
        },
        {
          url: `${CDN}/ivy-moss-1.jpg`,
          alt: "Model wearing INFNITY's Ivy Moss Jersey",
          focalX: 50,
          focalY: 30,
        },
        {
          url: `${CDN}/crimson-1.jpg`,
          alt: "Model wearing INFNITY's Crimson Static Jersey",
          focalX: 50,
          focalY: 30,
        },
      ],
      mobileImage: null,
      tone: 'light',
      overlay: 0,
      ctaLabel: 'Shop jerseys',
      ctaHref: '/search?q=jersey',
    },
    {
      id: 'ops-jorts',
      label: 'Ops jorts',
      headline: 'Straight leg, baggy fit. Size up for more.',
      images: [
        {
          url: `${CDN}/night-1.jpg`,
          alt: "Model wearing INFNITY's Night Ops Jorts",
          focalX: 50,
          focalY: 45,
        },
        {
          url: `${CDN}/mpnw-1.jpg`,
          alt: "Model wearing INFNITY's MPNW Sleeved Shirt",
          focalX: 50,
          focalY: 30,
        },
        {
          url: `${CDN}/camo-1_914b6df5-5613-4c6d-aad6-3907c28514c1.jpg`,
          alt: "Model wearing INFNITY's Recon Ops Jorts",
          focalX: 50,
          focalY: 45,
        },
      ],
      mobileImage: null,
      tone: 'light',
      overlay: 0,
      ctaLabel: 'Enter the vault',
      ctaHref: '/shop',
    },
  ],
};

/* ------------------------------------------------------------------ *
 * Homepage
 * ------------------------------------------------------------------ */

export const HOMEPAGE_SECTION_KEYS = [
  'statement',
  'featured',
  'vault',
  'lookbook',
  'community',
  'coming_soon',
  'newsletter',
] as const;
export type HomepageSectionKey = (typeof HOMEPAGE_SECTION_KEYS)[number];

export const HOMEPAGE_SECTION_LABELS: Record<HomepageSectionKey, string> = {
  statement: 'Brand statement',
  featured: 'Featured / new drop products',
  vault: 'Enter the Vault',
  lookbook: 'Lookbook',
  community: 'Styled By You',
  coming_soon: 'Coming soon / next drop',
  newsletter: 'Newsletter / early access',
};

export const homepageSchema = z.object({
  sections: z
    .array(z.object({ key: z.enum(HOMEPAGE_SECTION_KEYS), enabled: z.boolean() }))
    .refine(
      (sections) => new Set(sections.map((s) => s.key)).size === sections.length,
      'Each section appears once.',
    ),
  statement: z.object({ eyebrow: text(40), headline: text(120).min(1), body: text(600) }),
  featured: z.object({
    title: text(60).min(1),
    /** Explicit handles; empty = newest in-stock pieces. */
    productHandles: z.array(text(200)).max(12).default([]),
    limit: z.number().int().min(2).max(12).default(8),
  }),
  vault: z.object({
    eyebrow: text(40),
    headline: text(80).min(1),
    body: text(300),
    ctaLabel: text(30).min(1),
  }),
  newsletter: z.object({ headline: text(80).min(1), body: text(300) }),
});
export type HomepageContent = z.infer<typeof homepageSchema>;

export const DEFAULT_HOMEPAGE: HomepageContent = {
  sections: HOMEPAGE_SECTION_KEYS.map((key) => ({ key, enabled: true })),
  statement: {
    eyebrow: 'Infnity.clo',
    headline: 'Where raw identity meets untouchable design.',
    body: 'Built for the ones who don’t fold, don’t follow — and never settle. For the FLY only. Question is… you got what it takes to be one?',
  },
  featured: { title: 'Latest pieces', productHandles: [], limit: 8 },
  vault: {
    eyebrow: 'The full catalogue',
    headline: 'Enter the Vault',
    body: 'Every INFNITY piece in one place — current drops and the archive.',
    ctaLabel: 'Enter the Vault',
  },
  newsletter: {
    headline: 'Early access',
    body: 'Hear about new drops and restocks first. One email per drop — unsubscribe any time.',
  },
};

/* ------------------------------------------------------------------ *
 * Announcement bar
 * ------------------------------------------------------------------ */

export const announcementSchema = z.object({
  enabled: z.boolean(),
  text: text(120),
  href: linkSchema.nullable().default(null),
});
export type AnnouncementContent = z.infer<typeof announcementSchema>;
export const DEFAULT_ANNOUNCEMENT: AnnouncementContent = { enabled: false, text: '', href: null };

/* ------------------------------------------------------------------ *
 * Lookbook
 * ------------------------------------------------------------------ */

export const lookbookSchema = z.object({
  title: text(60).min(1),
  intro: text(400),
  images: z
    .array(
      z.object({
        url: imageUrlSchema,
        alt: text(160).min(3),
        caption: text(120).default(''),
        productHandles: z.array(text(200)).max(6).default([]),
      }),
    )
    .max(24),
});
export type LookbookContent = z.infer<typeof lookbookSchema>;

export const DEFAULT_LOOKBOOK: LookbookContent = {
  title: 'Lookbook',
  intro: 'Shot in studio for the current collection. Tap a look to shop it.',
  images: [
    {
      url: `${CDN}/fiji-1.jpg`,
      alt: "Model in INFNITY's Reversible Obsidian Blank Hoodie, front",
      caption: 'Reversible Obsidian Blank Hoodie',
      productHandles: ['infnitys-reversible-obsidian-blank-hoodie'],
    },
    {
      url: `${CDN}/RIRI-1.jpg`,
      alt: "Model in INFNITY's Iced Raven Tank",
      caption: 'Iced Raven Tank',
      productHandles: ['infnitys-iced-raven-tank'],
    },
    {
      url: `${CDN}/tyson-1_065aaaf1-27b7-4e72-8886-da5e4ed8bf91.jpg`,
      alt: "Model in INFNI-TEE'S LeCaptain America",
      caption: 'Infni-Tee — LeCaptain America',
      productHandles: ['infni-tees-lecaptain-america'],
    },
    {
      url: `${CDN}/camo-1_914b6df5-5613-4c6d-aad6-3907c28514c1.jpg`,
      alt: "Model in INFNITY's Recon Ops Jorts",
      caption: 'Recon Ops Jorts',
      productHandles: ['infnitys-stellar-ops-camo-jorts'],
    },
    {
      url: `${CDN}/ivy-moss-1.jpg`,
      alt: "Model in INFNITY's Ivy Moss Jersey",
      caption: 'Ivy Moss Jersey',
      productHandles: ['infnitys-crimson-static-jersey-copy'],
    },
    {
      url: `${CDN}/dein-1.jpg`,
      alt: "Model in INFNI-TEE'S Chaos",
      caption: 'Infni-Tee — Chaos',
      productHandles: ['infni-tees-chaos'],
    },
  ],
};

/* ------------------------------------------------------------------ *
 * Registry
 * ------------------------------------------------------------------ */

export const CMS_DOCUMENTS = {
  hero: { schema: heroSchema, defaults: DEFAULT_HERO, label: 'Homepage hero' },
  homepage: { schema: homepageSchema, defaults: DEFAULT_HOMEPAGE, label: 'Homepage sections' },
  announcement: {
    schema: announcementSchema,
    defaults: DEFAULT_ANNOUNCEMENT,
    label: 'Announcement bar',
  },
  lookbook: { schema: lookbookSchema, defaults: DEFAULT_LOOKBOOK, label: 'Lookbook' },
} as const;

export type CmsKey = keyof typeof CMS_DOCUMENTS;
export type CmsValue<K extends CmsKey> = z.infer<(typeof CMS_DOCUMENTS)[K]['schema']>;

/** Parses a stored value, falling back to defaults (never throws on read). */
export function parseCms<K extends CmsKey>(
  key: K,
  value: unknown,
): { value: CmsValue<K>; valid: boolean } {
  const entry = CMS_DOCUMENTS[key];
  const result = entry.schema.safeParse(value);
  return result.success
    ? { value: result.data as CmsValue<K>, valid: true }
    : { value: entry.defaults as CmsValue<K>, valid: false };
}
