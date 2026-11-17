import type { Metadata } from 'next';

import { saveContentAction } from '@/app/admin/actions/local';
import { Button, Card, Checkbox, Flash, LinkButton, PageHeader, SelectField, TextArea, TextField, formatDate } from '@/components/admin/ui';
import { catalogRepository } from '@/data';
import { requirePage, type SearchParams } from '@/server/admin/page';
import { SECTION_LABELS, getSiteContent, type HeroSlide } from '@/server/cms';

export const metadata: Metadata = { title: 'Content' };

const MEDIA_LIST = 'catalogue-media';

/** One hero slide. `slide` is undefined for the blank "add a slide" row. */
function SlideFields({ index, slide, position, total }: { index: number; slide?: HeroSlide; position: number; total: number }) {
  const prefix = `slide.${index}`;
  return (
    <fieldset className="mb-4 border border-neutral-300 p-4" data-testid={slide ? 'hero-slide' : 'hero-slide-new'}>
      <legend className="px-1 text-xs font-bold tracking-wide uppercase">{slide ? `Slide ${position + 1}` : 'Add a slide'}</legend>
      <input type="hidden" name={`${prefix}.id`} value={slide?.id ?? ''} />

      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((slot) => (
          <div key={slot} className="space-y-2">
            <TextField
              label={slot === 0 ? 'Image 1 (shown on phones)' : `Image ${slot + 1} (desktop)`}
              name={`${prefix}.image.${slot}.url`}
              list={MEDIA_LIST}
              maxLength={400}
              defaultValue={slide?.images[slot]?.url ?? ''}
              placeholder="/products/…/01.jpg"
              data-testid={slot === 0 ? `slide-image-${index}` : undefined}
            />
            <TextField label="Description (alt text)" name={`${prefix}.image.${slot}.alt`} maxLength={200} defaultValue={slide?.images[slot]?.alt ?? ''} />
          </div>
        ))}
      </div>
      {!slide && (
        <p className="mt-2 text-xs leading-relaxed text-neutral-600">
          Leave image 1 empty and no slide is added. Images must already be on this site: pick one from the catalogue list
          as you type.
        </p>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-4">
        <TextField label="Small line above" name={`${prefix}.eyebrow`} maxLength={60} defaultValue={slide?.eyebrow ?? ''} />
        <TextField label="Title" name={`${prefix}.title`} maxLength={80} defaultValue={slide?.title ?? ''} data-testid={`slide-title-${index}`} />
        <TextField label="Button label" name={`${prefix}.ctaLabel`} maxLength={40} defaultValue={slide?.ctaLabel ?? ''} />
        <TextField label="Button link" name={`${prefix}.ctaHref`} maxLength={300} defaultValue={slide?.ctaHref ?? '/shop'} hint="A path on this site, such as /shop." />
        <TextField label="Focal point X (0–100)" name={`${prefix}.focalX`} inputMode="numeric" pattern="\d{1,3}" defaultValue={slide?.focalPoint.x ?? 50} />
        <TextField label="Focal point Y (0–100)" name={`${prefix}.focalY`} inputMode="numeric" pattern="\d{1,3}" defaultValue={slide?.focalPoint.y ?? 22} hint="Where the crop stays centred. 0 is the top." />
        <TextField label="Darken (0–80)" name={`${prefix}.overlay`} inputMode="numeric" pattern="\d{1,2}" defaultValue={slide?.overlay ?? 0} hint="Use with light text over a busy photo." />
        <SelectField
          label="Text colour"
          name={`${prefix}.tone`}
          defaultValue={slide?.tone ?? 'dark'}
          options={[
            { value: 'dark', label: 'Dark text (light photo)' },
            { value: 'light', label: 'Light text (dark photo)' },
          ]}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <Checkbox label="Show this slide" name={`${prefix}.enabled`} defaultChecked={slide?.enabled ?? true} />
        {slide && <Checkbox label="Remove this slide when saving" name={`${prefix}.remove`} />}
        {slide && (
          <span className="flex gap-2">
            <Button variant="secondary" name="op" value={`slide-up:${slide.id}`} disabled={position === 0} aria-label={`Move slide ${position + 1} earlier`}>
              Move up
            </Button>
            <Button variant="secondary" name="op" value={`slide-down:${slide.id}`} disabled={position === total - 1} aria-label={`Move slide ${position + 1} later`}>
              Move down
            </Button>
          </span>
        )}
      </div>
    </fieldset>
  );
}

export default async function AdminContentPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePage('content.edit');
  const params = await searchParams;
  const [content, { products }] = await Promise.all([getSiteContent(), catalogRepository.listProducts()]);
  const media = [...new Map(products.flatMap((product) => product.media.map((item) => [item.url, `${product.name} — ${item.alt}`] as const))).entries()];

  return (
    <>
      <PageHeader
        title="Content"
        description={
          <>
            Everything on the homepage that is not a product. Saving publishes straight to the storefront — there is no
            separate draft. {content.updatedAt ? `Last saved ${formatDate(content.updatedAt)} by ${content.updatedBy}.` : 'Showing the built-in defaults; nothing has been saved yet.'}
          </>
        }
        actions={<LinkButton href="/" external>View storefront</LinkButton>}
      />
      <Flash params={params} />

      <datalist id={MEDIA_LIST}>
        {media.map(([url, label]) => (
          <option key={url} value={url}>
            {label}
          </option>
        ))}
      </datalist>

      <form action={saveContentAction} data-testid="content-form">
        {/* Pressing Enter in a field submits with the form's FIRST submit button.
            Without this, that would be a "Move up" button and Enter would reorder. */}
        <button type="submit" tabIndex={-1} aria-hidden="true" className="sr-only">
          Save
        </button>
        <Card title="Announcement bar" description="A single line above the header on every page. Leave it off unless there is something true to announce.">
          <div className="grid gap-4 md:grid-cols-2">
            <TextField label="Text" name="announcement.text" maxLength={140} defaultValue={content.announcement.text} data-testid="announcement-text" />
            <TextField label="Link (optional)" name="announcement.href" maxLength={300} defaultValue={content.announcement.href} placeholder="/shop" />
            <Checkbox label="Show the announcement bar" name="announcement.enabled" defaultChecked={content.announcement.enabled} />
          </div>
        </Card>

        <Card title="Campaign hero" description="Up to five slides. Use only photographs the brand owns. A slide with no image is not saved.">
          <input type="hidden" name="slideCount" value={content.hero.slides.length + 1} />
          <TextField
            label="Seconds per slide"
            name="hero.autoAdvanceSeconds"
            inputMode="numeric"
            pattern="\d{1,2}"
            defaultValue={content.hero.autoAdvanceSeconds}
            wrapClass="mb-4 max-w-48"
            hint="0 turns auto-advance off. Visitors who prefer reduced motion never see auto-advance."
          />
          {content.hero.slides.map((slide, index) => (
            <SlideFields key={slide.id} index={index} slide={slide} position={index} total={content.hero.slides.length} />
          ))}
          {content.hero.slides.length < 5 && <SlideFields index={content.hero.slides.length} position={content.hero.slides.length} total={content.hero.slides.length} />}
        </Card>

        <Card title="Brand statement">
          <div className="grid gap-4">
            <TextField label="Headline" name="statement.headline" maxLength={80} defaultValue={content.statement.headline} />
            <TextArea label="Supporting copy" name="statement.body" maxLength={500} rows={3} defaultValue={content.statement.body} />
          </div>
        </Card>

        <Card title="Homepage sections" description="The order sections appear in, top to bottom, and whether each is shown. A section with nothing to show hides itself regardless.">
          <ol className="divide-y divide-neutral-200 border border-neutral-200" data-testid="section-order">
            {content.sections.map((section, index) => (
              <li key={section.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
                <input type="hidden" name="sectionOrder" value={section.id} />
                <Checkbox id={`section-${section.id}`} label={`${index + 1}. ${SECTION_LABELS[section.id]}`} name={`section.${section.id}.enabled`} defaultChecked={section.enabled} />
                <span className="flex gap-2">
                  <Button variant="secondary" name="op" value={`section-up:${section.id}`} disabled={index === 0} aria-label={`Move ${SECTION_LABELS[section.id]} up`}>
                    Up
                  </Button>
                  <Button variant="secondary" name="op" value={`section-down:${section.id}`} disabled={index === content.sections.length - 1} aria-label={`Move ${SECTION_LABELS[section.id]} down`}>
                    Down
                  </Button>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-neutral-600">The move buttons save the whole form, so nothing typed elsewhere is lost.</p>
        </Card>

        <Card title="Featured products" description="Tick up to 12. With none ticked, the newest in-stock products are shown.">
          <TextField label="Heading" name="featured.heading" maxLength={60} defaultValue={content.featured.heading} wrapClass="mb-4 max-w-md" />
          <div className="grid max-h-72 gap-1 overflow-y-auto border border-neutral-200 p-3 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <Checkbox
                key={product.slug}
                id={`featured-${product.slug}`}
                name="featured.productSlugs"
                value={product.slug}
                label={product.name}
                defaultChecked={content.featured.productSlugs.includes(product.slug)}
              />
            ))}
            {products.length === 0 && <p className="text-sm text-neutral-600">The catalogue has no published products.</p>}
          </div>
        </Card>

        <Card title="Enter the Vault">
          <div className="grid gap-4 md:grid-cols-3">
            <TextField label="Heading" name="vault.heading" maxLength={60} defaultValue={content.vault.heading} />
            <TextField label="Button label" name="vault.ctaLabel" maxLength={40} defaultValue={content.vault.ctaLabel} />
            <TextField label="Line of copy" name="vault.body" maxLength={240} defaultValue={content.vault.body} />
          </div>
        </Card>

        <Card title="Lookbook" description="Up to 12 images. Link an image to a product by its handle to make it shoppable.">
          <input type="hidden" name="lookbookCount" value={content.lookbook.images.length + 1} />
          <div className="mb-4 grid gap-4 md:grid-cols-2">
            <TextField label="Heading" name="lookbook.heading" maxLength={60} defaultValue={content.lookbook.heading} />
            <TextField label="Line of copy" name="lookbook.body" maxLength={300} defaultValue={content.lookbook.body} />
          </div>
          <div className="space-y-3">
            {[...content.lookbook.images, null].map((image, index) => (
              <div key={index} className="grid gap-3 border border-neutral-200 p-3 md:grid-cols-[2fr_2fr_1.5fr_auto] md:items-end" data-testid={image ? 'lookbook-row' : 'lookbook-row-new'}>
                <TextField label={image ? `Image ${index + 1}` : 'Add an image'} name={`lookbook.${index}.url`} list={MEDIA_LIST} maxLength={400} defaultValue={image?.url ?? ''} placeholder="/products/…/02.jpg" />
                <TextField label="Description (alt text)" name={`lookbook.${index}.alt`} maxLength={200} defaultValue={image?.alt ?? ''} />
                <TextField label="Product handle (optional)" name={`lookbook.${index}.productSlug`} maxLength={120} defaultValue={image?.productSlug ?? ''} />
                {image ? <Checkbox label="Remove" name={`lookbook.${index}.remove`} /> : <span />}
              </div>
            ))}
          </div>
        </Card>

        <Card title="Styled By You and newsletter">
          <div className="grid gap-4 md:grid-cols-2">
            <TextField label="Community heading" name="community.heading" maxLength={60} defaultValue={content.community.heading} />
            <TextField label="Newsletter heading" name="newsletter.heading" maxLength={60} defaultValue={content.newsletter.heading} />
            <TextArea label="Community copy" name="community.body" maxLength={300} rows={3} defaultValue={content.community.body} />
            <TextArea label="Newsletter copy" name="newsletter.body" maxLength={300} rows={3} defaultValue={content.newsletter.body} hint="Say only what is true: no welcome discount or email is promised unless one exists." />
          </div>
        </Card>

        <Card title="You may also like" description="Recommendations are always real, in-stock products. They are suggestions only: nothing is ever added to a cart for the customer.">
          <div className="space-y-2">
            <Checkbox label="Show under each product" name="upsell.productPage" defaultChecked={content.upsell.productPage} />
            <Checkbox label="Show in the cart" name="upsell.cart" defaultChecked={content.upsell.cart} hint="Off by default." />
          </div>
        </Card>

        <Card title="Social links and contact" description="Only verified details. An empty field is simply not shown on the site.">
          <div className="grid gap-4 md:grid-cols-3">
            <TextField label="Instagram" name="social.instagram" type="url" maxLength={300} defaultValue={content.social.instagram} placeholder="https://www.instagram.com/…" />
            <TextField label="Facebook" name="social.facebook" type="url" maxLength={300} defaultValue={content.social.facebook} />
            <TextField label="Threads" name="social.threads" type="url" maxLength={300} defaultValue={content.social.threads} />
            <TextField label="Public contact email" name="contact.email" type="email" maxLength={254} defaultValue={content.contact.email} />
            <TextField label="Contact note" name="contact.note" maxLength={300} defaultValue={content.contact.note} wrapClass="md:col-span-2" />
          </div>
        </Card>

        <div className="sticky bottom-0 border-t border-neutral-300 bg-white py-3">
          <Button testId="content-save-all">Save and publish to the storefront</Button>
        </div>
      </form>
    </>
  );
}
