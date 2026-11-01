import type { UserRole } from '@/types';

/**
 * Canonical order-CANCELLATION role matrix — single source for the order
 * detail action and the cancel/refund modal.
 *
 * Mirrors the server gate (functions `requireRole` on the order status/cancel
 * route): brand_owner, developer, branch_owner, branch_staff. support and
 * regional_manager have /orders READ access (routePolicy) but the server
 * refuses their writes — offering them a Cancel button only opened a
 * dead-end "Manager Authorization Required" wall.
 *
 * DELIBERATELY DISTINCT from `@/admin/pages/refundRoles`: money movement
 * (canReleaseRefund: brand_owner/developer/support) is a SEPARATE, stricter
 * gate — branch_staff may cancel but never release a refund, support may
 * release a refund but never cancel. Do not merge the two lists.
 *
 * Fails CLOSED: absent, unknown, or unlisted roles are never granted.
 */
export const CANCEL_ORDER_ROLES: readonly UserRole[] = [
  'brand_owner',
  'developer',
  'branch_owner',
  'branch_staff',
];

/** May this role cancel an order? Fails closed. */
export function canCancelOrder(role: string | null | undefined): boolean {
  if (!role) return false;
  return (CANCEL_ORDER_ROLES as readonly string[]).includes(role);
}
