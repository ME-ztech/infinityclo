/**
 * Staff roles and permissions.
 *
 * Least privilege: each role gets exactly what its daily work needs. The matrix
 * is enforced on the server for every admin page, server action and route; the
 * UI uses the same function only to hide controls a person cannot use.
 */

export const ROLES = ['owner', 'operations', 'content', 'support'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner / Super Admin',
  operations: 'Operations',
  content: 'Content & Marketing',
  support: 'Support',
};

export const PERMISSIONS = [
  'overview:read',
  'products:read',
  'products:write',
  'products:publish',
  'inventory:read',
  'inventory:write',
  'orders:read',
  'orders:write',
  'orders:fulfill',
  'orders:cancel',
  'customers:read',
  'customers:write',
  'customers:export',
  'promotions:read',
  'promotions:write',
  'promotions:approve',
  'content:read',
  'content:write',
  'drops:write',
  'community:moderate',
  'marketing:read',
  'marketing:export',
  'messages:read',
  'messages:write',
  'analytics:read',
  'settings:read',
  'settings:write',
  'staff:manage',
  'audit:read',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const OPERATIONS: readonly Permission[] = [
  'overview:read',
  'products:read',
  'products:write',
  'products:publish',
  'inventory:read',
  'inventory:write',
  'orders:read',
  'orders:write',
  'orders:fulfill',
  'customers:read',
  'promotions:read',
  'drops:write',
  'messages:read',
  'messages:write',
  'analytics:read',
  'settings:read',
];

const CONTENT: readonly Permission[] = [
  'overview:read',
  'products:read',
  'inventory:read',
  'promotions:read',
  'promotions:write',
  'content:read',
  'content:write',
  'drops:write',
  'community:moderate',
  'marketing:read',
  'marketing:export',
  'analytics:read',
];

const SUPPORT: readonly Permission[] = [
  'overview:read',
  'products:read',
  'inventory:read',
  'orders:read',
  'orders:write',
  'customers:read',
  'customers:write',
  'messages:read',
  'messages:write',
];

const MATRIX: Record<Role, ReadonlySet<Permission>> = {
  owner: new Set(PERMISSIONS),
  operations: new Set(OPERATIONS),
  content: new Set(CONTENT),
  support: new Set(SUPPORT),
};

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return MATRIX[role]?.has(permission) ?? false;
}

export function permissionsFor(role: Role): readonly Permission[] {
  return PERMISSIONS.filter((permission) => MATRIX[role].has(permission));
}

/**
 * Actions that move money or touch a live sitewide offer are owner-only, by
 * design, in addition to the permission check: cancelling orders and approving
 * a discount for Shopify. `promotions:approve` and `orders:cancel` are granted
 * to the owner role alone in the matrix above.
 */
export const OWNER_ONLY: readonly Permission[] = [
  'promotions:approve',
  'orders:cancel',
  'staff:manage',
  'settings:write',
  'customers:export',
];
