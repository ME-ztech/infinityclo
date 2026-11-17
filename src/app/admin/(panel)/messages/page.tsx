import Link from 'next/link';

import { AdminPage, Badge, formatDate, Table, Td } from '@/components/admin/ui';
import { requireStaffPage } from '@/server/auth/staff';
import { listMessages, MESSAGE_KIND_LABELS, type MessageKind } from '@/server/messages';

export const metadata = { title: 'Inbox' };

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireStaffPage('messages:read', '/admin/messages');
  const { status = 'open' } = await searchParams;
  const statuses = status === 'open' ? ['new', 'open'] : [status];
  const messages = await listMessages(statuses);
  return (
    <AdminPage
      title="Inbox"
      description="Contact form, order help and return/exchange requests. Returns are reviewed against the published refund policy; refunds happen in Shopify, never automatically."
    >
      <div className="flex flex-wrap gap-2 text-sm">
        {['open', 'resolved', 'spam'].map((key) => (
          <Link
            key={key}
            href={`/admin/messages?status=${key}`}
            className={
              key === status
                ? 'bg-ink text-paper px-3 py-1.5'
                : 'border-line border bg-white px-3 py-1.5'
            }
          >
            {key}
          </Link>
        ))}
      </div>
      <Table
        head={['Received', 'From', 'Type', 'Order', 'Status', 'Message']}
        empty={messages.length ? undefined : 'Nothing here.'}
      >
        {messages.map((message) => (
          <tr key={message.id}>
            <Td>{formatDate(message.createdAt)}</Td>
            <Td>
              <Link
                href={`/admin/messages/${message.id}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {message.name}
              </Link>
              <p className="text-xs text-neutral-500">{message.email}</p>
            </Td>
            <Td>{MESSAGE_KIND_LABELS[message.kind as MessageKind] ?? message.kind}</Td>
            <Td>{message.orderNumber ?? '—'}</Td>
            <Td>
              <Badge tone={message.status === 'new' ? 'warn' : 'neutral'}>{message.status}</Badge>
            </Td>
            <Td className="max-w-md truncate">{message.body}</Td>
          </tr>
        ))}
      </Table>
    </AdminPage>
  );
}
