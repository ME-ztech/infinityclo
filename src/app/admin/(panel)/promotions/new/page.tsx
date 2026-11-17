import type { Metadata } from 'next';

import { createOfferAction } from '@/app/admin/actions/local';
import { OfferFields } from '@/components/admin/OfferForm';
import { Button, Card, Flash, LinkButton, PageHeader } from '@/components/admin/ui';
import { catalogRepository } from '@/data';
import { requirePage, type SearchParams } from '@/server/admin/page';

export const metadata: Metadata = { title: 'New offer' };

export default async function AdminNewOfferPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePage('offers.edit');
  const params = await searchParams;
  const { products } = await catalogRepository.listProducts();

  return (
    <>
      <PageHeader
        title="New offer"
        description="This saves a draft. A draft is not live: no customer can see or use it until an Owner activates it."
        actions={<LinkButton href="/admin/promotions">Back to promotions</LinkButton>}
      />
      <Flash params={params} />
      <form action={createOfferAction} data-testid="offer-create-form">
        <Card title="Offer">
          <OfferFields products={products.map((product) => ({ slug: product.slug, name: product.name }))} />
        </Card>
        <Button testId="offer-create-submit">Save as draft</Button>
      </form>
    </>
  );
}
