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

  // Customer accounts can never hold a partner-console session (authStore
  // rejects them at sign-in). Deny explicitly so the full-access fallthrough
  // below can never read as a customer grant.
  if (role === 'customer') return false;

  // Kitchen staff: KDS and base order views only
  if (role === 'branch_staff') {
    const allowed = ['/kds', '/orders', '/dashboard', '/menu', '/delivery-queue'];
    return allowed.some((prefix) => path.startsWith(prefix));
  }

  // Branch owners: everything except brand-level management, the admin portal
  // and customer PII. firestore.rules gates the customers collection on
  // `isUser(customerId) || isAdmin()` (brand_owner/developer only), so a
  // branch owner reaching /customers only ever got a permission-denied page.
  if (role === 'branch_owner') {
    const restricted = ['/branches', '/users', '/admin', '/customers'];
    return !restricted.some((prefix) => path.startsWith(prefix));
  }

  // Support: tickets, no admin portal, no app settings and no customer PII
  // (the same brand-admin-only rules gate as branch owners).
  if (role === 'support') {
    const restricted = ['/admin', '/settings', '/customers'];
    return !restricted.some((prefix) => path.startsWith(prefix));
  }

  // Regional managers: console-wide reporting, but customer PII stays behind
  // the brand-admin rules gate — the UI must not offer /customers here.
  if (role === 'regional_manager') {
    const restricted = ['/customers'];
    return !restricted.some((prefix) => path.startsWith(prefix));
  }

  // brand_owner, developer: full partner-console access
  return true;
}

/**
 * Roles the canonical firestore.rules allow to read franchise lead PII:
 * `isBrandOwner()` is brand_owner + developer ONLY. branch_owner, branch_staff,
 * support and regional_manager are denied, so franchise UI must not be offered
 * to them (a denied read otherwise looks like an empty pipeline).
 */
export const FRANCHISE_LEAD_READ_ROLES: UserRole[] = ['brand_owner', 'developer'];

/** Brand-level roles (brand_owner / developer). Branch roles never are. */
export function isBrandRole(role: UserRole | undefined): boolean {
  return !!role && FRANCHISE_LEAD_READ_ROLES.includes(role);
}

export function canReadFranchiseLeads(role: UserRole | undefined): boolean {
  return isBrandRole(role);
}

/**
 * Walk-in order create is branch-only: firestore.rules `orders` create admits
 * the `cust_walkin` arm only for isBranchOwner() (branch_owner/branch_staff)
 * with ownsBranch(branchId). Brand/support/regional roles must not be offered
 * an action that can only end in permission-denied.
 */
export function canCreateWalkInOrders(role: UserRole | undefined): boolean {
  return role === 'branch_owner' || role === 'branch_staff';
}

/**
 * Console roles that may hold a partner session. 'customer' is excluded by
 * design (denied above) — it never appears in sidebar/header navigation.
 */
export const PARTNER_CONSOLE_ROLES: UserRole[] = [
  'brand_owner',
  'developer',
  'support',
  'regional_manager',
  'branch_owner',
  'branch_staff',
];

/**
 * Roles permitted to reach `pathname`, per the enforced policy above.
 * Navigation consumes this so nav role lists can never disagree with the
 * guard: `navItem.roles` IS `rolesForRoute(navItem.path)`.
 */
export function rolesForRoute(pathname: string): UserRole[] {
  return PARTNER_CONSOLE_ROLES.filter((role) => canAccessRoute(role, pathname));
}
