import type { UserRole } from '@/types';

/**
 * Canonical Petpooja MENU-SYNC role matrix — MIRRORS the Cloud Functions gate.
 *
 * Source of truth (functions/src/index.ts:573-576):
 *   POST /petpooja/syncMenu
 *     requireRole(["brand_owner", "developer", "regional_manager", "branch_owner"])
 *
 * WHY THIS MODULE EXISTS: the partner console offered "Sync Menu" / "Sync POS"
 * to every role, so a branch_staff (the kitchen, the most likely person to
 * press it) got a 403 on every tap and the badge flipped to a failure state
 * that looked like a POS outage. Widening the SERVER gate was rejected:
 * catalog rewrites are a manager action.
 *
 * The lists here are the client's copy of the server's rule, nothing more —
 * they must never be used to GRANT anything, only to decide whether to offer a
 * control that the server would refuse.
 *
 * Fails CLOSED: an absent, unknown, or unlisted role is never granted.
 */
export const PETPOOJA_MENU_SYNC_ROLES: readonly UserRole[] = [
  'brand_owner',
  'developer',
  'regional_manager',
  'branch_owner',
];

/** May this role call POST /petpooja/syncMenu? Fails closed. */
export function canSyncPetpoojaMenu(role: string | null | undefined): boolean {
  if (!role) return false;
  return (PETPOOJA_MENU_SYNC_ROLES as readonly string[]).includes(role);
}

/** Copy shown in place of the control when the role may not sync. */
export const MENU_SYNC_DENIED_COPY =
  'Menu sync is a manager action — ask a branch owner, regional manager or brand admin to sync the Petpooja catalog.';
