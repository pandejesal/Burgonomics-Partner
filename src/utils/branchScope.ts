import type { User, UserRole } from '@/types';

/**
 * Roles with brand-wide *selection* visibility — they may pick any outlet in
 * the switcher. NOTE: `regional_manager` is listed here for SELECTION only;
 * its data reads must still be clamped to `user.cityIds` (see useAnalytics /
 * useTickets), so this list is not a licence for brand-wide data access.
 */
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

export interface OrderReadScope {
  readonly global: boolean;
  readonly branchIds: string[];
}

/** Regional orders must use the server-administered registry, not session claims. */
export function resolveOrderReadScope(
  role: UserRole | undefined,
  sessionBranchIds: readonly string[],
  selection: string | null,
  regionalRegistry: unknown,
): OrderReadScope {
  const global = role === 'brand_owner' || role === 'developer' || role === 'support';
  const selected = selection && selection !== 'all' ? selection : null;
  if (global) return { global: true, branchIds: selected ? [selected] : [] };

  let assigned: readonly unknown[] = [];
  if (role === 'regional_manager') {
    if (regionalRegistry && typeof regionalRegistry === 'object') {
      const registry = regionalRegistry as Record<string, unknown>;
      if (registry.role === 'regional_manager' && Array.isArray(registry.branchIds)) {
        assigned = registry.branchIds;
      }
    }
  } else if (role === 'branch_owner' || role === 'branch_staff') {
    assigned = sessionBranchIds;
  }
  if (!assigned.every((id) => typeof id === 'string' && id.length > 0 && id.trim() === id)) {
    return { global: false, branchIds: [] };
  }
  const ids = [...new Set(assigned as readonly string[])];
  return { global: false, branchIds: selected ? ids.filter((id) => id === selected) : ids };
}

export function chunkOrderBranchIds(branchIds: readonly string[]): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < branchIds.length; index += FIRESTORE_IN_LIMIT) {
    chunks.push(branchIds.slice(index, index + FIRESTORE_IN_LIMIT));
  }
  return chunks;
}

export function isScopeTruncated(branchIds?: string[] | null): boolean {
  return (branchIds?.length ?? 0) > FIRESTORE_IN_LIMIT;
}

/** Honest UI copy when scoped reads cover only the first 10 outlets. */
export function scopeTruncationNotice(branchIds?: string[] | null): string | null {
  if (!isScopeTruncated(branchIds)) return null;
  return (
    `Scoped views (orders, tickets) read the first ${FIRESTORE_IN_LIMIT} of ` +
    `${branchIds!.length} assigned outlets - narrow the outlet filter to see the rest.`
  );
}

/**
 * Store/outlet filter argument for a Control-Room order board.
 *
 * - Global roles: the UI selection wins (one outlet) — `null` means "all".
 * - Scoped roles: the board must read the FULL assigned scope (every branch the
 *   session owns) and let the UI filter narrow *within* that scope. Clamping
 *   the read to `branchIds[0]` made the outlet filter inert for a branch_owner
 *   with several outlets: the other outlets always rendered empty.
 *
 * A forged selection (localStorage is user-writable) never widens scope: it
 * falls back to `null`, and the data layer clamps to the assigned branches.
 */
export function resolveBoardStoreFilter(
  role: UserRole | undefined,
  assignedBranchIds: readonly string[],
  selectedFilter: string | null | undefined
): string | null {
  if (!selectedFilter || selectedFilter === 'all') return null;
  if (isGlobalRole(role)) return selectedFilter;
  return assignedBranchIds.includes(selectedFilter) ? selectedFilter : null;
}
