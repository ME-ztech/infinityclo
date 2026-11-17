import { ActionForm } from '@/components/admin/ActionForm';
import { ImageUrlInput } from '@/components/admin/ImageUrlInput';
import { AdminPage, Card, Field, inputClass, textareaClass } from '@/components/admin/ui';
import { catalogRepository } from '@/data';
import { HOMEPAGE_SECTION_LABELS } from '@/domain/cms';
import { can } from '@/domain/rbac';
import { requireStaffPage } from '@/server/auth/staff';
import { getCms } from '@/server/content/cms';
import { isAdminConfigured } from '@/server/shopify/config';

import { uploadImageAction } from '../products/actions';
import { saveContentAction } from './actions';

export const metadata = { title: 'Content' };

export default async function ContentPage() {
  const session = await requireStaffPage('content:read', '/admin/content');
  const canEdit = can(session.user.role, 'content:write');
  const upload =
    isAdminConfigured() && can(session.user.role, 'products:write') ? uploadImageAction : undefined;
  const [hero, homepage, announcement, lookbook, catalogue] = await Promise.all([
    getCms('hero'),
    getCms('homepage'),
    getCms('announcement'),
    getCms('lookbook'),
    catalogRepository.listProducts(),
  ]);
  const suggestions = [
    ...new Set(catalogue.products.flatMap((product) => product.media.map((media) => media.url))),
  ];
  const heroSlides = [...hero.value.slides, ...(hero.value.slides.length < 5 ? [null] : [])];
  const lookbookRows = [...lookbook.value.images, null, null];

  return (
    <AdminPage
      title="Content"
      description="Homepage, hero slideshow, announcement bar and lookbook. Saving publishes to the storefront immediately — no deployment. Images must be on your Shopify CDN (pick from the catalogue suggestions or upload)."
    >
      <datalist id="cms-image-suggestions">
        {suggestions.map((url) => (
          <option key={url} value={url} />
        ))}
      </datalist>
      {!canEdit && (
        <p className="text-sm text-neutral-600">Your role can view content but not change it.</p>
      )}

      <Card title="Announcement bar">
        <ActionForm
          action={saveContentAction}
          submitLabel="Publish announcement"
          testId="cms-announcement"
        >
          <input type="hidden" name="$key" value="announcement" />
          <input type="hidden" name="$version" value={announcement.version} />
          <fieldset disabled={!canEdit} className="grid gap-3 md:grid-cols-[auto_1fr_1fr]">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="enabled" defaultChecked={announcement.value.enabled} />{' '}
              Show
            </label>
            <input
              name="text"
              defaultValue={announcement.value.text}
              maxLength={120}
              placeholder="e.g. Restock drops Friday 6pm CT"
              className={inputClass}
              aria-label="Announcement text"
            />
            <input
              name="href"
              defaultValue={announcement.value.href ?? ''}
              placeholder="/shop (optional link)"
              className={inputClass}
              aria-label="Announcement link"
            />
          </fieldset>
        </ActionForm>
      </Card>

      <Card title="Hero slideshow">
        <ActionForm action={saveContentAction} submitLabel="Publish hero" testId="cms-hero">
          <input type="hidden" name="$key" value="hero" />
          <input type="hidden" name="$version" value={hero.version} />
          <fieldset disabled={!canEdit} className="flex flex-col gap-4">
            <div className="grid gap-3 md:grid-cols-4">
              <Field label="Slogan (above the statements)">
                <input name="slogan" defaultValue={hero.value.slogan} className={inputClass} />
              </Field>
              <Field label="Secondary link label">
                <input
                  name="secondaryCtaLabel"
                  defaultValue={hero.value.secondaryCtaLabel}
                  className={inputClass}
                />
              </Field>
              <Field label="Secondary link">
                <input
                  name="secondaryCtaHref"
                  defaultValue={hero.value.secondaryCtaHref}
                  className={inputClass}
                />
              </Field>
              <div className="flex items-end gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="autoplay" defaultChecked={hero.value.autoplay} />{' '}
                  Auto-advance
                </label>
                <Field label="Seconds">
                  <input
                    name="intervalSeconds"
                    type="number"
                    min={4}
                    max={15}
                    defaultValue={hero.value.intervalSeconds}
                    className={inputClass}
                  />
                </Field>
              </div>
            </div>
            {heroSlides.map((slide, index) => (
              <details key={slide?.id ?? 'new'} open={!slide} className="border-line border p-4">
                <summary className="cursor-pointer text-sm font-semibold">
                  {slide
                    ? `Slide ${index + 1}: ${slide.label}`
                    : '+ Add a slide (fill in the label to include it)'}
                </summary>
                <input type="hidden" name={`slides.${index}.id`} defaultValue={slide?.id ?? ''} />
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <Field label="Statement label (bottom-left list)">
                    <input
                      name={`slides.${index}.label`}
                      defaultValue={slide?.label}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Headline line (desktop)">
                    <input
                      name={`slides.${index}.headline`}
                      defaultValue={slide?.headline}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Button label">
                    <input
                      name={`slides.${index}.ctaLabel`}
                      defaultValue={slide?.ctaLabel ?? 'Shop now'}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Button link">
                    <input
                      name={`slides.${index}.ctaHref`}
                      defaultValue={slide?.ctaHref ?? '/shop'}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Photo tone">
                    <select
                      name={`slides.${index}.tone`}
                      defaultValue={slide?.tone ?? 'light'}
                      className={inputClass}
                    >
                      <option value="light">Light photo (dark text)</option>
                      <option value="dark">Dark photo (light text)</option>
                    </select>
                  </Field>
                  <Field label="Overlay strength %">
                    <input
                      name={`slides.${index}.overlay`}
                      type="number"
                      min={0}
                      max={80}
                      defaultValue={slide?.overlay ?? 0}
                      className={inputClass}
                    />
                  </Field>
                </div>
                <p className="mt-3 text-xs font-semibold">
                  Photos (1–3; desktop shows them side by side, phones show the first)
                </p>
                {[0, 1, 2].map((imageIndex) => {
                  const current = slide?.images[imageIndex];
                  return (
                    <div
                      key={imageIndex}
                      className="mt-2 grid gap-2 md:grid-cols-[2fr_2fr_80px_80px]"
                    >
                      <ImageUrlInput
                        name={`slides.${index}.images.${imageIndex}.url`}
                        defaultValue={current?.url}
                        uploadAction={upload}
                        label={`Slide ${index + 1} photo ${imageIndex + 1}`}
                      />
                      <input
                        name={`slides.${index}.images.${imageIndex}.alt`}
                        defaultValue={current?.alt}
                        placeholder="Describe the photo"
                        className={inputClass}
                        aria-label="Alt text"
                      />
                      <input
                        name={`slides.${index}.images.${imageIndex}.focalX`}
                        type="number"
                        min={0}
                        max={100}
                        defaultValue={current?.focalX ?? 50}
                        className={inputClass}
                        aria-label="Focal X %"
                        title="Focal point X %"
                      />
                      <input
                        name={`slides.${index}.images.${imageIndex}.focalY`}
                        type="number"
                        min={0}
                        max={100}
                        defaultValue={current?.focalY ?? 30}
                        className={inputClass}
                        aria-label="Focal Y %"
                        title="Focal point Y %"
                      />
                    </div>
                  );
                })}
                {slide && (
                  <label className="mt-3 flex items-center gap-2 text-sm text-red-700">
                    <input type="checkbox" name={`slides.${index}._remove`} /> Remove this slide
                  </label>
                )}
              </details>
            ))}
          </fieldset>
        </ActionForm>
      </Card>

      <Card title="Homepage sections">
        <ActionForm action={saveContentAction} submitLabel="Publish homepage" testId="cms-homepage">
          <input type="hidden" name="$key" value="homepage" />
          <input type="hidden" name="$version" value={homepage.version} />
          <fieldset disabled={!canEdit} className="flex flex-col gap-5">
            <div>
              <p className="mb-2 text-xs font-semibold">
                Order and visibility (the hero is always first; the footer always last)
              </p>
              <ul className="flex flex-col gap-2">
                {homepage.value.sections.map((section, index) => (
                  <li key={section.key} className="flex items-center gap-3 text-sm">
                    <input type="hidden" name={`sections.${index}.key`} value={section.key} />
                    <input
                      name={`sections.${index}.position`}
                      type="number"
                      defaultValue={index + 1}
                      className={`${inputClass} w-16`}
                      aria-label={`Position of ${HOMEPAGE_SECTION_LABELS[section.key]}`}
                    />
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        name={`sections.${index}.enabled`}
                        defaultChecked={section.enabled}
                      />{' '}
                      {HOMEPAGE_SECTION_LABELS[section.key]}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Statement eyebrow">
                <input
                  name="statement.eyebrow"
                  defaultValue={homepage.value.statement.eyebrow}
                  className={inputClass}
                />
              </Field>
              <Field label="Statement headline">
                <input
                  name="statement.headline"
                  defaultValue={homepage.value.statement.headline}
                  className={inputClass}
                />
              </Field>
              <Field label="Statement body">
                <textarea
                  name="statement.body"
                  defaultValue={homepage.value.statement.body}
                  rows={3}
                  className={textareaClass}
                />
              </Field>
              <Field label="Featured title">
                <input
                  name="featured.title"
                  defaultValue={homepage.value.featured.title}
                  className={inputClass}
                />
              </Field>
              <Field label="Featured product handles (blank = newest in stock)">
                <textarea
                  name="featured.productHandles"
                  defaultValue={homepage.value.featured.productHandles.join('\n')}
                  rows={3}
                  className={textareaClass}
                />
              </Field>
              <Field label="How many">
                <input
                  name="featured.limit"
                  type="number"
                  min={2}
                  max={12}
                  defaultValue={homepage.value.featured.limit}
                  className={inputClass}
                />
              </Field>
              <Field label="Vault eyebrow">
                <input
                  name="vault.eyebrow"
                  defaultValue={homepage.value.vault.eyebrow}
                  className={inputClass}
                />
              </Field>
              <Field label="Vault headline">
                <input
                  name="vault.headline"
                  defaultValue={homepage.value.vault.headline}
                  className={inputClass}
                />
              </Field>
              <Field label="Vault body">
                <input
                  name="vault.body"
                  defaultValue={homepage.value.vault.body}
                  className={inputClass}
                />
              </Field>
              <Field label="Vault button">
                <input
                  name="vault.ctaLabel"
                  defaultValue={homepage.value.vault.ctaLabel}
                  className={inputClass}
                />
              </Field>
              <Field label="Newsletter headline">
                <input
                  name="newsletter.headline"
                  defaultValue={homepage.value.newsletter.headline}
                  className={inputClass}
                />
              </Field>
              <Field label="Newsletter body">
                <input
                  name="newsletter.body"
                  defaultValue={homepage.value.newsletter.body}
                  className={inputClass}
                />
              </Field>
            </div>
          </fieldset>
        </ActionForm>
      </Card>

      <Card title="Lookbook">
        <ActionForm action={saveContentAction} submitLabel="Publish lookbook" testId="cms-lookbook">
          <input type="hidden" name="$key" value="lookbook" />
          <input type="hidden" name="$version" value={lookbook.version} />
          <fieldset disabled={!canEdit} className="flex flex-col gap-3">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Title">
                <input name="title" defaultValue={lookbook.value.title} className={inputClass} />
              </Field>
              <Field label="Intro">
                <input name="intro" defaultValue={lookbook.value.intro} className={inputClass} />
              </Field>
            </div>
            {lookbookRows.map((entry, index) => (
              <div
                key={entry?.url ?? `new-${index}`}
                className="border-line grid gap-2 border-t pt-3 md:grid-cols-[2fr_2fr_1fr_1fr_auto]"
              >
                <ImageUrlInput
                  name={`images.${index}.url`}
                  defaultValue={entry?.url}
                  uploadAction={upload}
                  label={`Look ${index + 1} photo`}
                />
                <input
                  name={`images.${index}.alt`}
                  defaultValue={entry?.alt}
                  placeholder="Describe the photo"
                  className={inputClass}
                  aria-label="Alt text"
                />
                <input
                  name={`images.${index}.caption`}
                  defaultValue={entry?.caption}
                  placeholder="Caption"
                  className={inputClass}
                  aria-label="Caption"
                />
                <input
                  name={`images.${index}.productHandles`}
                  defaultValue={entry?.productHandles.join(', ')}
                  placeholder="product-handle"
                  className={inputClass}
                  aria-label="Shop the look handles"
                />
                {entry ? (
                  <label className="flex items-center gap-1 text-xs text-red-700">
                    <input type="checkbox" name={`images.${index}._remove`} /> Remove
                  </label>
                ) : (
                  <span />
                )}
              </div>
            ))}
          </fieldset>
        </ActionForm>
      </Card>
    </AdminPage>
  );
}
