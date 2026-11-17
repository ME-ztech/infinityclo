import type { Metadata } from 'next';
import Link from 'next/link';

import { Badge, Button, Empty, Flash, PageHeader, TableWrap, formatDate, inputClass, td, th } from '@/components/admin/ui';
import { param, requirePage, type SearchParams } from '@/server/admin/page';
import { config } from '@/server/config';
import { listTickets, type Ticket } from '@/server/records';

export const metadata: Metadata = { title: 'Inbox' };

const STATUS: Record<Ticket['status'], { label: string; tone: 'warn' | 'neutral' | 'good' }> = {
  open: { label: 'Open', tone: 'warn' },
  in_progress: { label: 'In progress', tone: 'neutral' },
  closed: { label: 'Closed', tone: 'good' },
};

const TOPIC: Record<Ticket['topic'], string> = {
  order: 'Order',
  return: 'Return / exchange',
  sizing: 'Sizing',
  wholesale: 'Wholesale',
  other: 'Other',
};

export default async function AdminInboxPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePage('tickets.view');
  const params = await searchParams;
  const filter = param(params, 'status');
  const tickets = await listTickets();
  const shown = tickets.filter((ticket) => (filter === 'all' ? true : filter ? ticket.status === filter : ticket.status !== 'closed'));

  return (
    <>
      <PageHeader
        title="Inbox"
        description={`Messages from the contact form and help or return requests from customer accounts. ${
          config.email.configured && config.email.contactTo
            ? 'A copy of each contact message is also emailed to the team address.'
            : 'No email provider is connected, so messages arrive here only — check this screen.'
        }`}
      />
      <Flash params={params} />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3" aria-label="Filter tickets">
        <div>
          <label htmlFor="status" className="mb-1 block text-xs font-semibold uppercase">Show</label>
          <select id="status" name="status" defaultValue={filter} className={`${inputClass} w-56`}>
            <option value="">Open and in progress</option>
            <option value="open">Open</option>
            <option value="in_progress">In progress</option>
            <option value="closed">Closed</option>
            <option value="all">Everything</option>
          </select>
        </div>
        <Button variant="secondary">Filter</Button>
      </form>

      {shown.length === 0 ? (
        <Empty title="Nothing here">{tickets.length === 0 ? 'No messages have been received yet.' : 'No tickets match this filter.'}</Empty>
      ) : (
        <TableWrap label="Tickets">
          <thead>
            <tr>
              <th className={th}>Received</th>
              <th className={th}>From</th>
              <th className={th}>Topic</th>
              <th className={th}>Order</th>
              <th className={th}>Status</th>
              <th className={th}>Message</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((ticket) => (
              <tr key={ticket.id} data-testid="ticket-row">
                <td className={td}>
                  <Link href={`/admin/inbox/${ticket.id}`} className="font-semibold underline underline-offset-4">
                    {formatDate(ticket.createdAt)}
                  </Link>
                </td>
                <td className={td}>
                  {ticket.name}
                  <span className="block text-xs text-neutral-600">{ticket.email}</span>
                </td>
                <td className={td}>{TOPIC[ticket.topic]}</td>
                <td className={td}>{ticket.orderNumber ?? '—'}</td>
                <td className={td}><Badge tone={STATUS[ticket.status].tone}>{STATUS[ticket.status].label}</Badge></td>
                <td className={`${td} max-w-md`}>{ticket.message.length > 140 ? `${ticket.message.slice(0, 140)}…` : ticket.message}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </>
  );
}
