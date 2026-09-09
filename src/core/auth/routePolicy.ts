import type { UserRole } from '@/types';

/**
 * Single source of truth for partner route access.
 * Used by ProtectedRoute (enforced) and useRBAC.canAccessRoute (queries).
 * Default is DENY — every role lists what it may touch, nothing is open.
 */
export function canAccessRoute(role: UserRole | undefined, pathname: string): boolean {
  if (!role) return false;

  // Normalize: strip trailing slashes so "/orders/" polices like "/orders".
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;

  // Kitchen staff: KDS and base order views only
  if (role === 'branch_staff') {
    const allowed = ['/kds', '/orders', '/dashboard', '/menu', '/delivery-queue'];
    return allowed.some((prefix) => path.startsWith(prefix));
  }

  // Branch owners: everything except brand-level management and admin portal
  if (role === 'branch_owner') {
    const restricted = ['/branches', '/users', '/admin'];
    return !restricted.some((prefix) => path.startsWith(prefix));
  }

  // Support: tickets + customer 360, no admin portal or app settings
  if (role === 'support') {
    const restricted = ['/admin', '/settings'];
    return !restricted.some((prefix) => path.startsWith(prefix));
  }

  // brand_owner, developer, regional_manager: full partner-console access
  return true;
}
