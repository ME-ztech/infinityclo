import type { Metadata } from 'next';
import Link from 'next/link';

import { Badge, Empty, Flash, LinkButton, PageHeader, TableWrap, formatDate, td, th } from '@/components/admin/ui';
import { OFFER_STATUS } from '@/components/admin/OfferForm';
import { describeOffer } from '@/domain/offers';
import { seedDefaultOffers } from '@/server/admin/offers';
import { requirePage, type SearchParams } from '@/server/admin/page';
import { can } from '@/server/admin/permissions';
import { listOffers } from '@/server/offers';

export const metadata: Metadata = { title: 'Promotions' };

export default async function AdminPromotionsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requirePage('offers.view');
  const params = await searchParams;
  // Two starter drafts on a store that has never had an offer. Drafts only.
  await seedDefaultOffers(session.email);
  const offers = await listOffers();
  const canEdit = can(session.role, 'offers.edit');

  return (
    <>
      <PageHeader
        title="Promotions"
        description="Offers are written as drafts. A draft costs nothing and no customer can see or use it. An offer only reaches checkout when an Owner records a margin check and activates it."
        actions={canEdit ? <LinkButton href="/admin/promotions/new" variant="primary" testId="offer-new">New offer</LinkButton> : undefined}
      />
      <Flash params={params} />

      {offers.length === 0 ? (
        <Empty title="No offers">Create a draft to get started. Nothing goes live until an Owner activates it.</Empty>
      ) : (
        <TableWrap label="Offers">
          <thead>
            <tr>
              <th className={th}>Offer</th>
              <th className={th}>Status</th>
              <th className={th}>What it does</th>
              <th className={th}>Window</th>
              <th className={th}>Updated</th>
            </tr>
          </thead>
          <tbody>
            {offers.map((offer) => (
              <tr key={offer.id} data-testid="offer-row">
                <td className={td}>
                  <Link href={`/admin/promotions/${offer.id}`} className="font-semibold underline underline-offset-4">
                    {offer.title}
                  </Link>
                </td>
                <td className={td}>
                  <Badge tone={OFFER_STATUS[offer.status].tone} testId="offer-status">{OFFER_STATUS[offer.status].label}</Badge>
                  {offer.status === 'live' && offer.sandbox && <span className="ml-1"><Badge tone="warn">Sandbox only</Badge></span>}
                </td>
                <td className={td}>{describeOffer(offer)}</td>
                <td className={td}>
                  {offer.startsAt || offer.endsAt
                    ? `${offer.startsAt ? formatDate(offer.startsAt) : 'On activation'} → ${offer.endsAt ? formatDate(offer.endsAt) : 'No end'}`
                    : 'No dates set'}
                </td>
                <td className={td}>{formatDate(offer.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </>
  );
}
