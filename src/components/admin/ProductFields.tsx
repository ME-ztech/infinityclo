import { SelectField, TextArea, TextField } from './ui';

export interface ProductFieldValues {
  readonly title: string;
  readonly description: string;
  readonly productType: string;
  readonly vendor: string;
  readonly tags: string;
  readonly status: string;
  readonly seoTitle: string;
  readonly seoDescription: string;
}

/** The fields shared by "add product" and "edit product". */
export function ProductFields({ values, disabled }: { values: ProductFieldValues; disabled?: boolean }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <TextField label="Title" name="title" defaultValue={values.title} required maxLength={255} disabled={disabled} wrapClass="md:col-span-2" data-testid="product-title" />
      <TextArea
        label="Description"
        name="description"
        defaultValue={values.description}
        rows={7}
        maxLength={8000}
        disabled={disabled}
        wrapClass="md:col-span-2"
        hint="Plain text. Leave a blank line between paragraphs. Only state fabric, fit and measurements you have confirmed."
      />
      <TextField label="Product type" name="productType" defaultValue={values.productType} maxLength={100} disabled={disabled} hint="For example: Hoodies, T-Shirts, Jorts, Accessories. Drives the shop filters." />
      <TextField label="Vendor" name="vendor" defaultValue={values.vendor} maxLength={100} disabled={disabled} />
      <TextField label="Tags" name="tags" defaultValue={values.tags} maxLength={1000} disabled={disabled} hint="Comma-separated." wrapClass="md:col-span-2" />
      <SelectField
        label="Status"
        name="status"
        defaultValue={values.status}
        disabled={disabled}
        data-testid="product-status"
        options={[
          { value: 'DRAFT', label: 'Draft — hidden from customers' },
          { value: 'ACTIVE', label: 'Published — visible and purchasable' },
          { value: 'ARCHIVED', label: 'Archived' },
        ]}
        hint="New products should start as Draft and be published once photos, price and stock are checked."
      />
      <div aria-hidden className="hidden md:block" />
      <TextField label="SEO title" name="seoTitle" defaultValue={values.seoTitle} maxLength={70} disabled={disabled} hint="Up to 70 characters. Empty uses the product title." />
      <TextField label="SEO description" name="seoDescription" defaultValue={values.seoDescription} maxLength={320} disabled={disabled} hint="Up to 320 characters." />
    </div>
  );
}
