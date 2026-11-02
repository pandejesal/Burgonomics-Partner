import type { UserRole } from '@/types';

/**
 * Canonical KOT-resolution role matrix — MIRRORS the Cloud Functions gate.
 *
 * Source of truth (functions/src/index.ts:742-746):
 *   POST /petpooja/resolveKot
 *     requireRole(["brand_owner", "developer", "branch_owner", "branch_staff"])
 *
 * Support and regional_manager are refused (they read orders but do not run a
 * kitchen or own a branch's print), so the prompt must not be offered to them:
 * a "Did the kitchen receive this order?" control that can only 403 is exactly
 * the dead end this module exists to prevent.
 *
 * The list is the client's copy of the server's rule, nothing more — it is used
 * only to decide whether to OFFER a control, never to grant anything.
 *
 * Fails CLOSED: an absent, unknown, or unlisted role is never granted.
 */
export const KOT_RESOLVE_ROLES: readonly UserRole[] = [
  'brand_owner',
  'developer',
  'branch_owner',
  'branch_staff',
];

/** May this role call POST /petpooja/resolveKot? Fails closed. */
export function canResolvePetpoojaKot(role: string | null | undefined): boolean {
  if (!role) return false;
  return (KOT_RESOLVE_ROLES as readonly string[]).includes(role);
}

/** Copy shown when the signed-in role may not resolve a KOT. */
export const KOT_RESOLVE_DENIED_COPY =
  'Confirming the print is a branch or brand action — ask a branch owner, brand admin or the kitchen team to check the Petpooja printer.';
