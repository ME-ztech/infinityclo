import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ActionForm } from '@/components/admin/ActionForm';
import { AdminPage, Card, formatDate, inputClass } from '@/components/admin/ui';
import { can } from '@/domain/rbac';
import { requireStaffPage } from '@/server/auth/staff';
import {
  getMessage,
  MESSAGE_KIND_LABELS,
  MESSAGE_STATUSES,
  type MessageKind,
} from '@/server/messages';

import { updateMessageAction } from '../actions';

export const metadata = { title: 'Message' };

export default async function MessagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireStaffPage('messages:read', `/admin/messages/${id}`);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const message = await getMessage(id);
  if (!message) notFound();
  return (
    <AdminPage
      title={`${MESSAGE_KIND_LABELS[message.kind as MessageKind] ?? message.kind} from ${message.name}`}
      description={`${formatDate(message.createdAt)} · ${message.email}${message.orderNumber ? ` · order ${message.orderNumber}` : ''}`}
    >
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card title="Message">
          <p className="text-sm whitespace-pre-wrap">{message.body}</p>
          <p className="mt-4 text-sm">
            <a
              href={`mailto:${message.email}?subject=${encodeURIComponent(`Re: your INFNITY ${message.orderNumber ? `order ${message.orderNumber}` : 'message'}`)}`}
              className="underline"
            >
              Reply by email
            </a>
            {message.orderNumber && can(session.user.role, 'orders:read') && (
              <>
                {' '}
                ·{' '}
                <Link
                  href={`/admin/orders?q=${encodeURIComponent(message.orderNumber)}`}
                  className="underline"
                >
                  Find the order
                </Link>
              </>
            )}
          </p>
          {message.notes.length > 0 && (
            <ul className="border-line mt-6 flex flex-col gap-2 border-t pt-4 text-sm">
              {message.notes.map((note, index) => (
                <li key={index}>
                  <span className="text-neutral-500">
                    {formatDate(note.at)} · {note.by}:
                  </span>{' '}
                  {note.text}
                </li>
              ))}
            </ul>
          )}
        </Card>
        {can(session.user.role, 'messages:write') && (
          <Card title="Handle">
            <ActionForm action={updateMessageAction} submitLabel="Update">
              <input type="hidden" name="id" value={message.id} />
              <select
                name="status"
                defaultValue={message.status === 'new' ? 'open' : message.status}
                className={inputClass}
                aria-label="Status"
              >
                {MESSAGE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
              <textarea
                name="note"
                rows={3}
                placeholder="Internal note (e.g. replied, return label sent)"
                className="border-line border p-2 text-sm"
                aria-label="Internal note"
              />
            </ActionForm>
          </Card>
        )}
      </div>
    </AdminPage>
  );
}
