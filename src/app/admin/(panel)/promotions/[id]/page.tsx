import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import {
  activateOfferAction,
  deleteOfferAction,
  endOfferAction,
  marginCheckAction,
  pauseOfferAction,
  updateOfferAction,
} from '@/app/admin/actions/local';
import { OFFER_STATUS, OfferFields } from '@/components/admin/OfferForm';
import { Badge, Button, Card, Checkbox, ConfirmField, DisabledAction, Flash, LinkButton, PageHeader, formatDate } from '@/components/admin/ui';
import { catalogRepository } from '@/data';
import { describeOffer, validateOffer } from '@/domain/offers';
import { getGateway } from '@/server/admin/gateway';
import { ACTIVATE_CONFIRMATION } from '@/server/admin/offers';
import { requirePage, type SearchParams } from '@/server/admin/page';
import { can } from '@/server/admin/permissions';
import { getOffer } from '@/server/offers';

export const metadata: Metadata = { title: 'Offer' };

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default async function AdminOfferPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const session = await requirePage('offers.view');
  const { id } = await params;
  const query = await searchParams;
  const offer = await getOffer(id);
  if (!offer) notFound();

  const gateway = await getGateway();
  const { products } = await catalogRepository.listProducts();
  const canEdit = can(session.role, 'offers.edit');
  const canActivate = can(session.role, 'offers.activate');
  const editable = canEdit && offer.status !== 'live' && offer.status !== 'ended';
  const problems = validateOffer(offer);

  let usage: number | null = null;
  if (offer.discountId && gateway) {
    try {
      usage = await gateway.discountUsage(offer.discountId, offer.method);
    } catch {
      usage = null;
    }
  }

  // Worked example on a $100.00 basket of eligible items, so the saving is concrete.
  const example = 10_000;
  const exampleSaving = Math.round((example * offer.percentOff) / 100);

  return (
    <>
      <PageHeader
        title={offer.title}
        description={describeOffer(offer)}
        actions={<LinkButton href="/admin/promotions">Back to promotions</LinkButton>}
      />
      <Flash params={query} />

      <Card title="Status" testId="offer-status-card">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={OFFER_STATUS[offer.status].tone} testId="offer-status">{OFFER_STATUS[offer.status].label}</Badge>
          {offer.status === 'live' && offer.sandbox && <Badge tone="warn">Sandbox only — not at real checkout</Badge>}
          {offer.marginCheckedBy && offer.status !== 'live' && <Badge tone="good" testId="offer-margin-ok">Margin checked</Badge>}
        </div>
        <dl className="mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold text-neutral-600 uppercase">Example</dt>
            <dd>
              On {money(example)} of eligible items
              {offer.kind === 'bundle' ? ` (${offer.minQuantity ?? 2} or more)` : ''}: saves {money(exampleSaving)}, customer pays{' '}
              {money(example - exampleSaving)} before shipping and tax.
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-neutral-600 uppercase">Times used</dt>
            <dd data-testid="offer-usage">
              {offer.discountId ? (usage === null ? 'Unavailable' : `${usage} order${usage === 1 ? '' : 's'}`) : 'Not activated yet'}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-neutral-600 uppercase">Created</dt>
            <dd>
              {formatDate(offer.createdAt)} by {offer.createdBy}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-neutral-600 uppercase">Activated</dt>
            <dd>{offer.activatedAt ? `${formatDate(offer.activatedAt)} by ${offer.activatedBy}` : 'Never'}</dd>
          </div>
        </dl>
        {problems.length > 0 && (
          <ul role="alert" className="mt-4 list-disc space-y-1 pl-5 text-sm text-red-900">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        )}
      </Card>

      {offer.status !== 'ended' && (
        <Card
          title="Go live"
          description="Activation is the moment an offer starts costing margin. It needs an Owner, a recorded margin check on this exact draft, and a typed confirmation. Editing the draft afterwards clears the margin check."
        >
          {!canActivate ? (
            <DisabledAction label="Activate" reason="Only an Owner can record the margin check and activate an offer." />
          ) : offer.status === 'live' ? (
            <div className="grid gap-6 md:grid-cols-2">
              <form action={pauseOfferAction}>
                <input type="hidden" name="id" value={offer.id} />
                <Button variant="secondary" testId="offer-pause">Pause</Button>
                <p className="mt-2 text-xs leading-relaxed text-neutral-600">Stops the discount at checkout immediately. It can be activated again after a fresh margin check.</p>
              </form>
              <form action={endOfferAction} className="space-y-3">
                <input type="hidden" name="id" value={offer.id} />
                <ConfirmField word="END" id="confirm-end" />
                <Button variant="danger" testId="offer-end">End for good</Button>
                <p className="text-xs leading-relaxed text-neutral-600">Removes the discount and frees its code. An ended offer cannot be reactivated.</p>
              </form>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              <form action={marginCheckAction} className="space-y-3" data-testid="offer-margin-form">
                <input type="hidden" name="id" value={offer.id} />
                <Checkbox
                  label="I have checked the margin on this offer as it is written above"
                  name="marginChecked"
                  required
                  defaultChecked={Boolean(offer.marginCheckedBy)}
                  hint={offer.marginCheckedBy ? `Recorded by ${offer.marginCheckedBy}.` : 'Recorded with your name in the audit log.'}
                />
                <Button variant="secondary" testId="offer-margin-submit">Record margin check</Button>
              </form>
              <form action={activateOfferAction} className="space-y-3" data-testid="offer-activate-form">
                <input type="hidden" name="id" value={offer.id} />
                <ConfirmField word={ACTIVATE_CONFIRMATION} id="confirm-activate" />
                <Button testId="offer-activate" disabled={!offer.marginCheckedBy || problems.length > 0}>
                  Activate
                </Button>
                <p className="text-xs leading-relaxed text-neutral-600">
                  {!offer.marginCheckedBy
                    ? 'Record the margin check first.'
                    : gateway?.mode === 'sandbox'
                      ? 'In the sandbox this only marks the offer live here; real checkout is unaffected.'
                      : 'From this moment the discount is enforced at checkout for real orders.'}
                </p>
              </form>
              {offer.status === 'paused' && (
                <form action={endOfferAction} className="space-y-3 md:col-span-2">
                  <input type="hidden" name="id" value={offer.id} />
                  <ConfirmField word="END" id="confirm-end" />
                  <Button variant="danger" testId="offer-end">End for good</Button>
                </form>
              )}
            </div>
          )}
        </Card>
      )}

      <form action={updateOfferAction} data-testid="offer-edit-form">
        <input type="hidden" name="id" value={offer.id} />
        <Card
          title="Offer"
          description={
            offer.status === 'live'
              ? 'A live offer is read-only, so checkout and this screen can never disagree. Pause it to edit.'
              : offer.status === 'ended'
                ? 'This offer has ended and is kept for the record.'
                : undefined
          }
        >
          <OfferFields offer={offer} products={products.map((product) => ({ slug: product.slug, name: product.name }))} disabled={!editable} />
        </Card>
        {editable && <Button testId="offer-save">Save draft</Button>}
      </form>

      {canEdit && offer.status !== 'live' && (
        <div className="mt-6">
          <Card title="Delete" description="Removes this offer. Past orders that used it keep their record.">
            <form action={deleteOfferAction} className="flex flex-wrap items-end gap-4">
              <input type="hidden" name="id" value={offer.id} />
              <ConfirmField word="DELETE" id="confirm-delete" />
              <Button variant="danger" testId="offer-delete">Delete offer</Button>
            </form>
          </Card>
        </div>
      )}
    </>
  );
}
