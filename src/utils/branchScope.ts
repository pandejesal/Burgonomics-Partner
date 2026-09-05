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
