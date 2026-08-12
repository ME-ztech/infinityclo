/**
 * Joins class names, dropping falsy values.
 *
 * Deliberately not `tailwind-merge`: nothing here relies on later classes
 * overriding earlier ones, and a conflict-resolution pass would be an extra
 * dependency and a runtime cost for a problem this codebase does not have.
 */
export type ClassValue = string | number | null | undefined | false;

export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ');
}
