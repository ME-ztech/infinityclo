'use server';

import { revalidatePath } from 'next/cache';

import type { CmsKey } from '@/domain/cms';
import { compact, numberOr, parseNested, splitList } from '@/lib/form';
import { actorOf, runAction, type ActionResult } from '@/server/admin/action';
import { saveCms } from '@/server/content/cms';

type Raw = Record<string, unknown>;
const str = (value: unknown) => (typeof value === 'string' ? value : '');

function image(raw: Raw | undefined) {
  if (!raw || !str(raw.url).trim()) return null;
  return { url: str(raw.url).trim(), alt: str(raw.alt), focalX: numberOr(raw.focalX, 50), focalY: numberOr(raw.focalY, 30) };
}

function build(key: CmsKey, raw: Raw): unknown {
  switch (key) {
    case 'hero':
      return {
        slogan: str(raw.slogan),
        secondaryCtaLabel: str(raw.secondaryCtaLabel),
        secondaryCtaHref: str(raw.secondaryCtaHref),
        autoplay: raw.autoplay === true,
        intervalSeconds: numberOr(raw.intervalSeconds, 6),
        slides: compact<Raw>(raw.slides)
          .filter((slide) => str(slide.label).trim())
          .map((slide, index) => ({
            id: str(slide.id) || `slide-${index + 1}`,
            label: str(slide.label),
            headline: str(slide.headline),
            ctaLabel: str(slide.ctaLabel),
            ctaHref: str(slide.ctaHref),
            tone: slide.tone === 'dark' ? 'dark' : 'light',
            overlay: numberOr(slide.overlay, 0),
            images: compact<Raw>(slide.images).map(image).filter(Boolean),
            mobileImage: image(slide.mobileImage as Raw | undefined),
          })),
      };
    case 'homepage':
      return {
        sections: compact<Raw>(raw.sections)
          .map((section) => ({ key: str(section.key), enabled: section.enabled === true, position: numberOr(section.position, 99) }))
          .sort((a, b) => a.position - b.position)
          .map(({ key, enabled }) => ({ key, enabled })),
        statement: raw.statement,
        featured: { title: str((raw.featured as Raw)?.title), productHandles: splitList((raw.featured as Raw)?.productHandles), limit: numberOr((raw.featured as Raw)?.limit, 8) },
        vault: raw.vault,
        newsletter: raw.newsletter,
      };
    case 'announcement':
      return { enabled: raw.enabled === true, text: str(raw.text), href: str(raw.href).trim() || null };
    case 'lookbook':
      return {
        title: str(raw.title),
        intro: str(raw.intro),
        images: compact<Raw>(raw.images)
          .filter((entry) => str(entry.url).trim())
          .map((entry) => ({ url: str(entry.url).trim(), alt: str(entry.alt), caption: str(entry.caption), productHandles: splitList(entry.productHandles) })),
      };
  }
}

const BOOLEANS: Record<CmsKey, (raw: FormData) => string[]> = {
  hero: () => ['autoplay'],
  homepage: (form) => [...form.keys()].filter((key) => /^sections\.\d+\.key$/.test(key)).map((key) => key.replace('.key', '.enabled')),
  announcement: () => ['enabled'],
  lookbook: () => [],
};

export async function saveContentAction(_state: ActionResult | null, form: FormData): Promise<ActionResult> {
  return runAction('content:write', async (user) => {
    const key = String(form.get('$key')) as CmsKey;
    if (!['hero', 'homepage', 'announcement', 'lookbook'].includes(key)) throw new Error('Unknown content document.');
    const version = Number(form.get('$version'));
    const raw = parseNested(form, BOOLEANS[key](form));
    const saved = await saveCms(key, build(key, raw), version, actorOf(user));
    revalidatePath('/', 'layout');
    revalidatePath('/admin/content');
    return `Published to the storefront (version ${saved.version}).`;
  });
}
