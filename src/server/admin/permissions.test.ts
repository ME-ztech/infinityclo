// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { AdminAuthError, authorise, type AdminSession } from './auth';
import { PERMISSIONS, ROLES, can, permissionsOf, type Role } from './permissions';

const session = (role: Role): AdminSession => ({ id: `stf_${role}`, email: `${role}@example.com`, name: role, role });

describe('permission matrix', () => {
  it('gives the Owner everything', () => {
    for (const permission of PERMISSIONS) expect(can('owner', permission)).toBe(true);
  });

  it('keeps money, access and configuration away from non-owners', () => {
    for (const role of ['operations', 'content', 'support'] as const) {
      for (const permission of ['offers.activate', 'staff.manage', 'settings.edit', 'settings.view', 'audit.view', 'customers.export'] as const) {
        expect(can(role, permission), `${role} must not hold ${permission}`).toBe(false);
      }
    }
  });

  it('lets only Owner and Operations refund or cancel an order', () => {
    expect(can('owner', 'orders.refund')).toBe(true);
    expect(can('operations', 'orders.refund')).toBe(true);
    expect(can('content', 'orders.refund')).toBe(false);
    expect(can('support', 'orders.refund')).toBe(false);
  });

  it('lets Support read orders without being able to change them', () => {
    expect(can('support', 'orders.view')).toBe(true);
    expect(can('support', 'orders.edit')).toBe(false);
    expect(can('support', 'orders.export')).toBe(false);
  });

  it('holds no permission that is not in the catalogue', () => {
    for (const role of ROLES) {
      for (const permission of permissionsOf(role)) expect(PERMISSIONS).toContain(permission);
    }
  });

  it('answers false for an unknown role', () => {
    expect(can('intruder' as Role, 'overview.view')).toBe(false);
  });
});

describe('authorise — the guard every action and page goes through', () => {
  it('refuses a refund from Support and from Content', () => {
    for (const role of ['support', 'content'] as const) {
      let thrown: unknown;
      try {
        authorise(session(role), 'orders.refund');
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(AdminAuthError);
      expect((thrown as AdminAuthError).reason).toBe('forbidden');
    }
  });

  it('allows a refund from Operations and the Owner', () => {
    expect(authorise(session('operations'), 'orders.refund').role).toBe('operations');
    expect(authorise(session('owner'), 'orders.refund').role).toBe('owner');
  });

  it('refuses everything when nobody is signed in', () => {
    let thrown: unknown;
    try {
      authorise(null, 'orders.refund');
    } catch (error) {
      thrown = error;
    }
    expect((thrown as AdminAuthError).reason).toBe('unauthenticated');
  });

  it('refuses a rate change from anyone but the Owner', () => {
    expect(() => authorise(session('operations'), 'settings.edit')).toThrow(AdminAuthError);
    expect(authorise(session('owner'), 'settings.edit').role).toBe('owner');
  });
});
