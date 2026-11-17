/**
 * CSV exports. Permission-checked on the server; every export is audited.
 * Customer data exports are owner-only (customers:export).
 */
import { desc, eq } from 'drizzle-orm';

import { can, type Permission } from '@/domain/rbac';
import { audit } from '@/server/audit';
import { getStaffSession } from '@/server/auth/staff';
import { getDb } from '@/server/db/client';
import { drops, subscribers, waitlistEntries } from '@/server/db/schema';
import { listCustomers, listOrders } from '@/server/shopify/admin';

const PERMISSIONS: Record<string, Permission> = {
  subscribers: 'marketing:export',
  waitlist: 'marketing:export',
  orders: 'orders:read',
  customers: 'customers:export',
};

function csv(rows: Array<Array<string | number | null | undefined>>): string {
  const cell = (value: string | number | null | undefined) => {
    const text = value === null || value === undefined ? '' : String(value);
    // Neutralise spreadsheet formula injection.
    const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return rows.map((row) => row.map(cell).join(',')).join('\n');
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string }> },
): Promise<Response> {
  const { kind } = await params;
  const permission = PERMISSIONS[kind];
  const session = await getStaffSession();
  if (!permission || !session) return new Response('Not found', { status: 404 });
  if (!can(session.user.role, permission)) return new Response('Forbidden', { status: 403 });
  const url = new URL(request.url);
  const q = url.searchParams.get('q') || null;
  let rows: Array<Array<string | number | null>> = [];
  try {
    if (kind === 'subscribers') {
      const db = await getDb();
      const list = await db.select().from(subscribers).orderBy(desc(subscribers.createdAt));
      rows = [
        [
          'email',
          'status',
          'source',
          'consent_text',
          'consent_at',
          'confirmed_at',
          'unsubscribed_at',
          'groups',
        ],
        ...list.map((s) => [
          s.email,
          s.status,
          s.source,
          s.consentText,
          s.consentAt.toISOString(),
          s.confirmedAt?.toISOString() ?? null,
          s.unsubscribedAt?.toISOString() ?? null,
          s.groups.join(' '),
        ]),
      ];
    } else if (kind === 'waitlist') {
      const db = await getDb();
      const list = await db
        .select({
          email: waitlistEntries.email,
          drop: drops.name,
          consentText: waitlistEntries.consentText,
          consentAt: waitlistEntries.consentAt,
        })
        .from(waitlistEntries)
        .innerJoin(drops, eq(drops.id, waitlistEntries.dropId));
      rows = [
        ['email', 'drop', 'consent_text', 'consent_at'],
        ...list.map((w) => [w.email, w.drop, w.consentText, w.consentAt.toISOString()]),
      ];
    } else if (kind === 'orders') {
      const { orders } = await listOrders(q);
      rows = [
        [
          'order',
          'date',
          'customer',
          'email',
          'payment',
          'fulfilment',
          'items',
          'total',
          'currency',
          'test',
        ],
        ...orders.map((o) => [
          o.name,
          o.processedAt,
          o.customerName,
          o.email,
          o.financialStatus,
          o.fulfillmentStatus,
          o.itemCount,
          o.total.amount,
          o.total.currencyCode,
          o.test ? 'yes' : 'no',
        ]),
      ];
    } else if (kind === 'customers') {
      const { customers } = await listCustomers(q);
      rows = [
        ['name', 'email', 'marketing', 'orders', 'total_spent', 'last_order', 'tags'],
        ...customers.map((c) => [
          c.displayName,
          c.email,
          c.marketingState,
          c.numberOfOrders,
          c.amountSpent?.amount ?? null,
          c.lastOrderAt,
          c.tags.join(' '),
        ]),
      ];
    }
  } catch (error) {
    return new Response(`Export failed: ${(error as Error).message}`, { status: 502 });
  }
  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: 'export',
    summary: `Exported ${kind} (${rows.length - 1} rows)`,
    targetType: 'export',
    targetId: kind,
  });
  return new Response(csv(rows), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="infnity-${kind}-${new Date().toISOString().slice(0, 10)}.csv"`,
      'cache-control': 'private, no-store',
    },
  });
}
