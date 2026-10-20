import type { UserRole } from "@/types";

/**
 * Canonical refund-action role matrix — MIRRORS the Cloud Functions gates.
 *
 * Source of truth (functions/src/index.ts):
 *   - POST /payments/refund  → requireRole(["brand_owner", "developer", "support"])
 *       (line ~368; served by `releaseRefund`, also used for retry)
 *   - POST /refunds/dispose  → requireRole(["brand_owner", "developer", "support",
 *                                            "branch_owner", "branch_staff"])
 *       (line ~392; served by `disposeRefund`, the reject path)
 *
 * `requireRole` (functions/src/core/middleware.ts) additionally always grants
 * `brand_owner`/`developer` via its brand-admin shortcut, which is already
 * reflected in both lists below.
 *
 * WHY THIS MODULE EXISTS: `useAdmin().role` returns the canonical Firestore
 * role (UserRole), but the refund UI compared it against display strings
 * ("Developer", "Finance", "Store Manager") that never equal a canonical
 * value — so every release/reject/retry was silently denied for all staff.
 * These predicates compare canonical values and FAIL CLOSED: an absent,
 * unknown, or unlisted role is never granted.
 */

/** Roles the server accepts on POST /payments/refund (release + retry). */
export const REFUND_RELEASE_ROLES: readonly UserRole[] = [
  "brand_owner",
  "developer",
  "support",
];

/** Roles the server accepts on POST /refunds/dispose (reject). */
export const REFUND_REJECT_ROLES: readonly UserRole[] = [
  "brand_owner",
  "developer",
  "support",
  "branch_owner",
  "branch_staff",
];

/** Release a pending payout (POST /payments/refund). Fails closed. */
export function canReleaseRefund(role: string | null | undefined): boolean {
  return includesRole(REFUND_RELEASE_ROLES, role);
}

/**
 * Retry a failed payout — replay of the same server call as release
 * (POST /payments/refund is idempotent per order). Fails closed.
 */
export function canRetryRefund(role: string | null | undefined): boolean {
  return includesRole(REFUND_RELEASE_ROLES, role);
}

/** Reject a refund request (POST /refunds/dispose). Fails closed. */
export function canRejectRefund(role: string | null | undefined): boolean {
  return includesRole(REFUND_REJECT_ROLES, role);
}

function includesRole(allowed: readonly UserRole[], role: string | null | undefined): boolean {
  if (!role) return false; // absent role → deny
  return (allowed as readonly string[]).includes(role);
}
