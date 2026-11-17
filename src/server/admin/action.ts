import 'server-only';

import { ZodError } from 'zod';

import type { Permission } from '@/domain/rbac';
import { ForbiddenError, requireStaffAction, type StaffSession } from '@/server/auth/staff';
import { ShopifyApiError } from '@/server/shopify/graphql';

export interface ActionResult {
  readonly ok?: boolean;
  readonly message?: string;
  readonly error?: string;
  readonly redirectTo?: string;
}

/**
 * Wraps every admin server action: enforces the permission on the server,
 * then converts failures into a message the operator can act on. Nothing is
 * reported as saved unless the underlying write returned successfully.
 */
export async function runAction(
  permission: Permission,
  work: (staff: StaffSession['user']) => Promise<ActionResult | string | void>,
): Promise<ActionResult> {
  let staff: StaffSession;
  try {
    staff = await requireStaffAction(permission);
  } catch (error) {
    if (error instanceof ForbiddenError)
      return { error: 'You don’t have permission to do that. Ask the owner.' };
    throw error;
  }
  try {
    const result = await work(staff.user);
    if (typeof result === 'string') return { ok: true, message: result };
    return result ?? { ok: true, message: 'Saved.' };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        error: error.issues
          .map((issue) => `${issue.path.join(' › ') || 'Form'}: ${issue.message}`)
          .slice(0, 6)
          .join(' · '),
      };
    }
    if (error instanceof ShopifyApiError) {
      return {
        error:
          error.kind === 'not_configured'
            ? `${error.message} Nothing was changed.`
            : `Shopify: ${error.message}`,
      };
    }
    console.error(`[admin] ${permission} failed: ${(error as Error).message}`);
    return { error: (error as Error).message || 'Something went wrong. Nothing was changed.' };
  }
}

export function actorOf(user: StaffSession['user']) {
  return { id: user.id, email: user.email };
}
