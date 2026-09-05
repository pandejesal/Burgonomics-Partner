import { useAuthStore } from '@/stores/authStore';
import type { UserRole } from '@/types';
import { canAccessRoute as policyCanAccessRoute } from './routePolicy';

export function useRBAC() {
  const { user } = useAuthStore();
  const role = user?.role as UserRole | undefined;

  const isSuperAdmin = role === 'brand_owner' || role === 'developer';
  const isBranchManager = role === 'branch_owner';
  const isStaff = role === 'branch_staff';
  const isKitchen = role === 'branch_staff';
  const isSupport = role === 'support';
  const isRegionalManager = role === 'regional_manager';

  const canAccessBranch = (targetBranchId: string): boolean => {
    if (!user) return false;
    // Brand Owners, Developers, Regional Managers & Support have multi-branch oversight
    if (isSuperAdmin || isRegionalManager || isSupport) {
      return true;
    }
    // Branch Owners and Staff are restricted strictly to assigned branch IDs
    return Array.isArray(user.branchIds) && user.branchIds.includes(targetBranchId);
  };

  // Enforced policy lives in ./routePolicy — this stays a read-only query.
  const canAccessRoute = (pathname: string): boolean => {
    if (!user) return false;
    return policyCanAccessRoute(role, pathname);
  };

  const hasPermission = (permission: string): boolean => {
    if (!role) return false;
    if (isSuperAdmin) return true;

    switch (permission) {
      case 'manage_branches':
        return isSuperAdmin || isRegionalManager;
      case 'view_global_analytics':
        return isSuperAdmin || isRegionalManager;
      case 'view_branch_analytics':
        return isSuperAdmin || isRegionalManager || isBranchManager;
      case 'edit_menu':
        return isSuperAdmin || isRegionalManager || isBranchManager;
      case 'toggle_86_stock':
        return isSuperAdmin || isBranchManager || isStaff;
      case 'dispatch_porter':
        return isSuperAdmin || isBranchManager || isStaff;
      case 'resolve_tickets':
        return isSuperAdmin || isSupport || isBranchManager;
      default:
        return false;
    }
  };

  return {
    user,
    role,
    isSuperAdmin,
    isBranchManager,
    isStaff,
    isKitchen,
    isSupport,
    isRegionalManager,
    canAccessBranch,
    canAccessRoute,
    hasPermission,
  };
}
