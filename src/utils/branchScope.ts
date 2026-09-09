import type { User, UserRole } from '@/types';

/** Roles with brand-wide visibility. Everyone else is scoped to user.branchIds. */
export const GLOBAL_ROLES: UserRole[] = [
  'brand_owner',
  'developer',
  'support',
  'regional_manager',
];

export function isGlobalRole(role: UserRole | undefined): boolean {
  return !!role && GLOBAL_ROLES.includes(role);
}

/**
 * Branch ids a data query may touch.
 * - Global roles: the UI selection, or [] meaning "brand-wide".
 * - Scoped roles (branch_owner, branch_staff): the UI selection ONLY when it
 *   lies inside the session's assigned branches (localStorage is
 *   user-writable, so a forged selection must never widen scope);
 *   otherwise the session's own branches. Empty = no access, never global.
 */
export function resolveScopedBranchIds(
  user: Pick<User, 'role' | 'branchIds'> | null | undefined,
  selectedBranchId: string | null
): string[] {
  if (!user) return [];
  if (isGlobalRole(user.role)) {
    return selectedBranchId && selectedBranchId !== 'all' ? [selectedBranchId] : [];
  }
  const assigned = user.branchIds ?? [];
  if (selectedBranchId && selectedBranchId !== 'all') {
    return assigned.includes(selectedBranchId) ? [selectedBranchId] : assigned;
  }
  return assigned;
}

/**
 * Firestore `in` queries accept at most 10 values: scoped order/ticket
 * views silently read only the first 10 branches. Callers must surface the
 * truncation in the UI (no silent drop) via scopeTruncationNotice().
 */
export const FIRESTORE_IN_LIMIT = 10;

export function isScopeTruncated(branchIds: string[]): boolean {
  return branchIds.length > FIRESTORE_IN_LIMIT;
}

/** Honest UI copy when scoped reads cover only the first 10 outlets. */
export function scopeTruncationNotice(branchIds: string[]): string | null {
  if (!isScopeTruncated(branchIds)) return null;
  return (
    `Scoped views (orders, tickets) read the first ${FIRESTORE_IN_LIMIT} of ` +
    `${branchIds.length} assigned outlets — narrow the outlet filter to see the rest.`
  );
}
