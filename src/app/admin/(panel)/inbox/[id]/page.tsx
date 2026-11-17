import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { updateTicketAction } from '@/app/admin/actions/local';
import { Badge, Button, Card, Flash, LinkButton, PageHeader, SelectField, TextArea, formatDate } from '@/components/admin/ui';
import { requirePage, type SearchParams } from '@/server/admin/page';
import { can } from '@/server/admin/permissions';
import { getTicket } from '@/server/records';

export const metadata: Metadata = { title: 'Ticket' };

export default async function AdminTicketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const session = await requirePage('tickets.view');
  const { id } = await params;
  const query = await searchParams;
  const ticket = await getTicket(id);
  if (!ticket) notFound();
  const canEdit = can(session.role, 'tickets.edit');

  return (
    <>
      <PageHeader
        title={`${ticket.topic === 'return' ? 'Return / exchange' : ticket.topic} — ${ticket.name}`}
        description={`Received ${formatDate(ticket.createdAt)}${ticket.emailed ? ' · a copy was emailed to the team address' : ''}`}
        actions={<LinkButton href="/admin/inbox">Back to inbox</LinkButton>}
      />
      <Flash params={query} />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="min-w-0">
          <Card title="Message">
            {/* Rendered as text: nothing a sender types can become markup. */}
            <p className="text-sm leading-relaxed whitespace-pre-wrap" data-testid="ticket-message">{ticket.message}</p>
          </Card>

          <Card title="Internal notes" description="Staff only. Replies to the customer are sent from your own email, not from here.">
            {ticket.notes.length === 0 ? (
              <p className="text-sm text-neutral-600">No notes yet.</p>
            ) : (
              <ol className="space-y-3 text-sm">
                {ticket.notes.map((note, index) => (
                  <li key={index} className="border-l-2 border-neutral-300 pl-3">
                    <p className="text-xs text-neutral-600">
                      {formatDate(note.at)} · {note.by}
                    </p>
                    <p className="whitespace-pre-wrap">{note.text}</p>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div className="min-w-0">
          <Card title="From">
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs font-semibold text-neutral-600 uppercase">Name</dt>
                <dd>{ticket.name}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-neutral-600 uppercase">Email</dt>
                <dd>
                  <a href={`mailto:${ticket.email}`} className="break-all underline underline-offset-4">
                    {ticket.email}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-neutral-600 uppercase">Phone</dt>
                <dd>{ticket.phone ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-neutral-600 uppercase">Order</dt>
                <dd>{ticket.orderNumber ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-neutral-600 uppercase">Account</dt>
                <dd>
                  {ticket.customerId ? (
                    can(session.role, 'customers.view') ? (
                      <Link href={`/admin/customers/${ticket.customerId}`} className="underline underline-offset-4">
                        Signed-in customer
                      </Link>
                    ) : (
                      'Signed-in customer'
                    )
                  ) : (
                    'Sent from the public contact form (identity not verified)'
                  )}
                </dd>
              </div>
            </dl>
          </Card>

          <Card title="Status">
            <div className="mb-3">
              <Badge tone={ticket.status === 'closed' ? 'good' : ticket.status === 'open' ? 'warn' : 'neutral'} testId="ticket-status">
                {ticket.status.replace('_', ' ')}
              </Badge>
            </div>
            {canEdit ? (
              <form action={updateTicketAction} className="space-y-3" data-testid="ticket-form">
                <input type="hidden" name="id" value={ticket.id} />
                <SelectField
                  label="Set status"
                  name="status"
                  defaultValue={ticket.status}
                  options={[
                    { value: 'open', label: 'Open' },
                    { value: 'in_progress', label: 'In progress' },
                    { value: 'closed', label: 'Closed' },
                  ]}
                />
                <TextArea label="Add an internal note (optional)" name="note" maxLength={2000} rows={3} />
                <Button testId="ticket-save">Save</Button>
              </form>
            ) : (
              <p className="text-sm text-neutral-600">Your role can read tickets but not change them.</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
