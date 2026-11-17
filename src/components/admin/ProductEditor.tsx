'use client';

/**
 * Product editor for the back office. Everything saves to Shopify (productSet),
 * which stays the system of record. Options generate the variant grid; existing
 * variants keep their ids so their stock and order history stay attached.
 */
import Image from 'next/image';
import { useActionState, useMemo, useState } from 'react';

import { cn } from '@/lib/cn';

import type { ActionResult } from './ActionForm';
import { inputClass, textareaClass } from './ui';

export interface EditorProduct {
  id: string | null;
  title: string;
  handle: string;
  description: string;
  productType: string;
  vendor: string;
  status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
  tags: string[];
  seoTitle: string;
  seoDescription: string;
  options: Array<{ name: string; values: string[] }>;
  variants: Array<{
    id: string | null;
    optionValues: Array<{ optionName: string; name: string }>;
    price: string;
    compareAtPrice: string | null;
    sku: string | null;
    barcode: string | null;
    weightGrams: number | null;
  }>;
  media: Array<{ url: string; alt: string | null }>;
  facts: { fit: string; fabric: string; care: string; sizeGuide: string };
}

interface Row {
  key: string;
  id: string | null;
  optionValues: Array<{ optionName: string; name: string }>;
  price: string;
  compareAtPrice: string;
  sku: string;
  barcode: string;
  weightGrams: string;
  initialQuantity: string;
}

const keyOf = (values: Array<{ optionName: string; name: string }>) => values.map((v) => `${v.optionName}=${v.name}`).join('|');

function combinations(options: Array<{ name: string; values: string[] }>): Array<Array<{ optionName: string; name: string }>> {
  return options.reduce<Array<Array<{ optionName: string; name: string }>>>(
    (acc, option) => acc.flatMap((combo) => option.values.map((value) => [...combo, { optionName: option.name, name: value }])),
    [[]],
  );
}

export function ProductEditor({
  product,
  canPublish,
  publications,
  locations,
  sizeGuides,
  imageSuggestions,
  saveAction,
  uploadAction,
}: {
  product: EditorProduct;
  canPublish: boolean;
  publications: Array<{ id: string; name: string }>;
  locations: Array<{ id: string; name: string }>;
  sizeGuides: Array<{ id: string; name: string }>;
  imageSuggestions: string[];
  saveAction: (state: ActionResult | null, form: FormData) => Promise<ActionResult>;
  uploadAction: (form: FormData) => Promise<{ url?: string; error?: string }>;
}) {
  const [state, formAction, pending] = useActionState(saveAction, null);
  const [fields, setFields] = useState({
    title: product.title,
    handle: product.handle,
    description: product.description,
    productType: product.productType,
    vendor: product.vendor || 'Infnity.clo',
    status: product.status,
    tags: product.tags.join(', '),
    seoTitle: product.seoTitle,
    seoDescription: product.seoDescription,
    ...product.facts,
  });
  const [options, setOptions] = useState(
    product.options.length ? product.options.map((option) => ({ name: option.name, values: option.values.join(', ') })) : [{ name: 'Size', values: 'S, M, L, XL, 2XL' }],
  );
  const existing = useMemo(() => new Map(product.variants.map((variant) => [keyOf(variant.optionValues), variant])), [product.variants]);
  const [overrides, setOverrides] = useState<Record<string, Partial<Row>>>({});
  const [newMedia, setNewMedia] = useState<Array<{ url: string; alt: string }>>([]);
  const [publicationIds, setPublicationIds] = useState<string[]>([]);
  const [locationId, setLocationId] = useState(locations[0]?.id ?? '');
  const [uploadState, setUploadState] = useState<string | null>(null);
  const [bulkPrice, setBulkPrice] = useState('');

  const parsedOptions = options
    .map((option) => ({ name: option.name.trim(), values: [...new Set(option.values.split(',').map((value) => value.trim()).filter(Boolean))] }))
    .filter((option) => option.name && option.values.length);

  const rows: Row[] = combinations(parsedOptions).map((optionValues) => {
    const key = keyOf(optionValues);
    const found = existing.get(key);
    const base: Row = {
      key,
      id: found?.id ?? null,
      optionValues,
      price: found?.price ?? '',
      compareAtPrice: found?.compareAtPrice ?? '',
      sku: found?.sku ?? '',
      barcode: found?.barcode ?? '',
      weightGrams: found?.weightGrams ? String(found.weightGrams) : '',
      initialQuantity: '',
    };
    return { ...base, ...overrides[key] };
  });

  const removedVariants = product.variants.filter((variant) => !rows.some((row) => row.key === keyOf(variant.optionValues)));

  function payload(status: EditorProduct['status']) {
    return JSON.stringify({
      id: product.id,
      title: fields.title,
      handle: fields.handle || null,
      description: fields.description,
      productType: fields.productType,
      vendor: fields.vendor,
      status,
      tags: fields.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      seoTitle: fields.seoTitle || null,
      seoDescription: fields.seoDescription || null,
      options: parsedOptions,
      variants: rows.map((row) => ({
        id: row.id,
        optionValues: row.optionValues,
        price: row.price,
        compareAtPrice: row.compareAtPrice || null,
        sku: row.sku || null,
        barcode: row.barcode || null,
        weightGrams: row.weightGrams ? Number(row.weightGrams) : null,
        initialQuantity: product.id ? null : row.initialQuantity === '' ? null : Number(row.initialQuantity),
      })),
      newMedia: newMedia.filter((media) => media.url),
      facts: { fit: fields.fit || null, fabric: fields.fabric || null, care: fields.care || null, sizeGuide: fields.sizeGuide || null },
      publicationIds,
      initialLocationId: product.id ? null : locationId || null,
    });
  }


  async function upload(file: File) {
    setUploadState('Uploading…');
    const data = new FormData();
    data.set('file', file);
    const result = await uploadAction(data);
    if (result.url) {
      setNewMedia((media) => [...media, { url: result.url!, alt: '' }]);
      setUploadState('Uploaded to Shopify — add a description below.');
    } else {
      setUploadState(result.error ?? 'Upload failed.');
    }
  }

  const set = (key: keyof typeof fields) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setFields((current) => ({ ...current, [key]: event.target.value }));
  const setRow = (key: string, patch: Partial<Row>) => setOverrides((current) => ({ ...current, [key]: { ...current[key], ...patch } }));

  return (
    <form
      action={formAction}
      className="flex flex-col gap-6"
      data-testid="product-editor"
      onSubmit={(event) => {
        if (removedVariants.length && !window.confirm(`This removes ${removedVariants.length} existing variant(s) from Shopify. Continue?`)) event.preventDefault();
      }}
    >
      <input type="hidden" name="payload" value={payload(product.status)} />

      <section className="border-line grid gap-4 border bg-white p-5 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-semibold md:col-span-2">
          Title
          <input value={fields.title} onChange={set('title')} className={inputClass} required data-testid="product-title" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold md:col-span-2">
          Description (blank line = new paragraph)
          <textarea value={fields.description} onChange={set('description')} rows={7} className={textareaClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Product type
          <input value={fields.productType} onChange={set('productType')} list="product-types" className={inputClass} placeholder="e.g. Hoodies" />
          <datalist id="product-types">
            {['T-Shirts', 'Tanks', 'Hoodies', 'Sweatpants', 'Jorts', 'Jerseys', 'Accessories', 'Beanies'].map((type) => (
              <option key={type} value={type} />
            ))}
          </datalist>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Tags (comma separated)
          <input value={fields.tags} onChange={set('tags')} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          URL handle (blank = from title)
          <input value={fields.handle} onChange={set('handle')} className={inputClass} placeholder="infnitys-new-piece" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Vendor
          <input value={fields.vendor} onChange={set('vendor')} className={inputClass} />
        </label>
      </section>

      <section className="border-line flex flex-col gap-4 border bg-white p-5">
        <h2 className="text-sm font-semibold uppercase">Garment facts (shown in the FIT / FABRIC / CARE accordions)</h2>
        <p className="text-xs text-neutral-500">Only publish what is confirmed — a customer orders against these. Leave blank and the site says it hasn’t been published yet.</p>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Fit
            <textarea value={fields.fit} onChange={set('fit')} rows={3} className={textareaClass} placeholder="Baggy fitted tee · Size up for a baggier fit" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Fabric
            <textarea value={fields.fabric} onChange={set('fabric')} rows={3} className={textareaClass} placeholder="250 gsm 100% cotton" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Care
            <textarea value={fields.care} onChange={set('care')} rows={3} className={textareaClass} placeholder="Do not wash with hot water" />
          </label>
        </div>
        <label className="flex max-w-sm flex-col gap-1 text-xs font-semibold">
          Size guide
          <select value={fields.sizeGuide} onChange={set('sizeGuide')} className={inputClass}>
            <option value="">None</option>
            {sizeGuides.map((guide) => (
              <option key={guide.id} value={guide.id}>
                {guide.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="border-line flex flex-col gap-4 border bg-white p-5">
        <h2 className="text-sm font-semibold uppercase">Options & variants</h2>
        {options.map((option, index) => (
          <div key={index} className="grid gap-2 md:grid-cols-[200px_1fr_auto]">
            <input
              aria-label={`Option ${index + 1} name`}
              value={option.name}
              onChange={(event) => setOptions((current) => current.map((item, i) => (i === index ? { ...item, name: event.target.value } : item)))}
              className={inputClass}
              placeholder="Size"
            />
            <input
              aria-label={`Option ${index + 1} values`}
              value={option.values}
              onChange={(event) => setOptions((current) => current.map((item, i) => (i === index ? { ...item, values: event.target.value } : item)))}
              className={inputClass}
              placeholder="S, M, L, XL, 2XL"
            />
            <button type="button" onClick={() => setOptions((current) => current.filter((_, i) => i !== index))} className="text-signal px-2 text-sm underline" disabled={options.length === 1}>
              Remove
            </button>
          </div>
        ))}
        {options.length < 3 && (
          <button type="button" onClick={() => setOptions((current) => [...current, { name: 'Colour', values: '' }])} className="self-start text-sm underline">
            + Add option (e.g. Colour)
          </button>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Set every price (CAD)
            <input value={bulkPrice} onChange={(event) => setBulkPrice(event.target.value)} className={cn(inputClass, 'w-32')} placeholder="45.00" />
          </label>
          <button type="button" className="border-ink h-10 border px-3 text-xs font-semibold uppercase" onClick={() => rows.forEach((row) => setRow(row.key, { price: bulkPrice }))}>
            Apply
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left text-xs text-neutral-500 uppercase">
                <th className="py-2">Variant</th>
                <th>Price</th>
                <th>Compare-at</th>
                <th>SKU</th>
                <th>Barcode</th>
                <th>Weight (g)</th>
                {!product.id && <th>Starting stock</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-line border-t">
                  <td className="py-2 pr-2 font-medium">
                    {row.optionValues.map((value) => value.name).join(' / ')}
                    {!row.id && product.id && <span className="ml-2 text-xs text-blue-700">new</span>}
                  </td>
                  {(['price', 'compareAtPrice', 'sku', 'barcode', 'weightGrams'] as const).map((key) => (
                    <td key={key} className="pr-2">
                      <input
                        aria-label={`${key} for ${row.optionValues.map((value) => value.name).join(' / ')}`}
                        value={row[key]}
                        onChange={(event) => setRow(row.key, { [key]: event.target.value })}
                        className={cn(inputClass, 'h-9')}
                        inputMode={key === 'price' || key === 'compareAtPrice' || key === 'weightGrams' ? 'decimal' : undefined}
                      />
                    </td>
                  ))}
                  {!product.id && (
                    <td>
                      <input value={row.initialQuantity} onChange={(event) => setRow(row.key, { initialQuantity: event.target.value })} className={cn(inputClass, 'h-9 w-24')} inputMode="numeric" aria-label="Starting stock" />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!product.id && locations.length > 0 && (
          <label className="flex max-w-sm flex-col gap-1 text-xs font-semibold">
            Stock location
            <select value={locationId} onChange={(event) => setLocationId(event.target.value)} className={inputClass}>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {removedVariants.length > 0 && (
          <p className="text-signal text-sm">Saving removes: {removedVariants.map((variant) => variant.optionValues.map((v) => v.name).join(' / ')).join(', ')}</p>
        )}
      </section>

      <section className="border-line flex flex-col gap-4 border bg-white p-5">
        <h2 className="text-sm font-semibold uppercase">Images</h2>
        {product.media.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {product.media.map((media) => (
              <li key={media.url}>
                <Image src={media.url.split('?')[0]!} alt={media.alt ?? ''} width={96} height={96} className="h-24 w-24 object-cover" />
              </li>
            ))}
          </ul>
        )}
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Upload to Shopify (JPEG, PNG or WebP)
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => event.target.files?.[0] && void upload(event.target.files[0])} className="text-sm" />
        </label>
        {uploadState && <p className="text-xs text-neutral-600" role="status">{uploadState}</p>}
        {newMedia.map((media, index) => (
          <div key={index} className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
            <input value={media.url} onChange={(event) => setNewMedia((current) => current.map((m, i) => (i === index ? { ...m, url: event.target.value } : m)))} list="image-suggestions" className={inputClass} placeholder="https://cdn.shopify.com/…" aria-label="Image URL" />
            <input value={media.alt} onChange={(event) => setNewMedia((current) => current.map((m, i) => (i === index ? { ...m, alt: event.target.value } : m)))} className={inputClass} placeholder="Describe the photo (alt text)" aria-label="Image description" />
            <button type="button" onClick={() => setNewMedia((current) => current.filter((_, i) => i !== index))} className="text-signal text-sm underline">Remove</button>
          </div>
        ))}
        <datalist id="image-suggestions">
          {imageSuggestions.map((url) => (
            <option key={url} value={url} />
          ))}
        </datalist>
        <button type="button" onClick={() => setNewMedia((current) => [...current, { url: '', alt: '' }])} className="self-start text-sm underline">
          + Add image by URL
        </button>
      </section>

      <section className="border-line grid gap-4 border bg-white p-5 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-semibold">
          SEO title
          <input value={fields.seoTitle} onChange={set('seoTitle')} maxLength={70} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          SEO description
          <input value={fields.seoDescription} onChange={set('seoDescription')} maxLength={320} className={inputClass} />
        </label>
        {publications.length > 0 && (
          <fieldset className="md:col-span-2">
            <legend className="text-xs font-semibold">Publish to sales channels (when saved as Active)</legend>
            <div className="mt-2 flex flex-wrap gap-4 text-sm">
              {publications.map((publication) => (
                <label key={publication.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={publicationIds.includes(publication.id)}
                    onChange={(event) => setPublicationIds((current) => (event.target.checked ? [...current, publication.id] : current.filter((id) => id !== publication.id)))}
                  />
                  {publication.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" name="$status" value="DRAFT" disabled={pending} className="bg-ink text-paper hover:bg-signal h-11 px-5 text-xs font-semibold tracking-wide uppercase disabled:opacity-50" data-testid="save-draft">
          {pending ? 'Saving…' : 'Save as draft'}
        </button>
        {canPublish && (
          <button
            type="submit"
            name="$status"
            value="ACTIVE"
            onClick={(event) => {
              if (!window.confirm('Publish this product? It will be visible and purchasable on the live store.')) event.preventDefault();
            }}
            disabled={pending}
            className="border-ink hover:bg-ink hover:text-paper h-11 border px-5 text-xs font-semibold tracking-wide uppercase disabled:opacity-50"
          >
            {pending ? 'Publishing…' : 'Save & publish (Active)'}
          </button>
        )}
        {state?.error && <p role="alert" className="text-signal text-sm">{state.error}</p>}
        {state?.ok && <p role="status" className="text-sm text-green-700">{state.message}</p>}
      </div>
    </form>
  );
}
