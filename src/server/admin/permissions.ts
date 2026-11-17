/**
 * Roles and permissions for the back office.
 *
 * Least privilege: a role holds only what its job needs. Anything that moves
 * money or changes who has access (activating a discount, managing staff,
 * settings) is Owner-only. The matrix is data, so it is unit-tested directly
 * and the UI and the server guard read the same source.
 */
export const ROLES = ['owner', 'operations', 'content', 'support'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner / Super Admin',
  operations: 'Operations',
  content: 'Content / Marketing',
  support: 'Support',
};

export const PERMISSIONS = [
  'overview.view',
  'products.view',
  'products.edit',
  'inventory.view',
  'inventory.edit',
  'orders.view',
  'orders.edit',
  'orders.export',
  'customers.view',
  'customers.edit',
  'customers.export',
  'offers.view',
  'offers.edit',
  'offers.activate',
  'content.edit',
  'drops.edit',
  'community.moderate',
  'marketing.view',
  'marketing.export',
  'tickets.view',
  'tickets.edit',
  'analytics.view',
  'settings.view',
  'settings.edit',
  'staff.manage',
  'audit.view',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const everything: readonly Permission[] = PERMISSIONS;

const MATRIX: Readonly<Record<Role, readonly Permission[]>> = {
  owner: everything,
  operations: [
    'overview.view',
    'products.view',
    'products.edit',
    'inventory.view',
    'inventory.edit',
    'orders.view',
    'orders.edit',
    'orders.export',
    'customers.view',
    'customers.edit',
    'offers.view',
    'tickets.view',
    'tickets.edit',
    'analytics.view',
  ],
  content: [
    'overview.view',
    'products.view',
    'offers.view',
    'offers.edit',
    'content.edit',
    'drops.edit',
    'community.moderate',
    'marketing.view',
    'marketing.export',
    'analytics.view',
  ],
  support: ['overview.view', 'orders.view', 'customers.view', 'customers.edit', 'tickets.view', 'tickets.edit'],
};

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role]?.includes(permission) ?? false;
}

export function permissionsOf(role: Role): readonly Permission[] {
  return MATRIX[role] ?? [];
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}
