import { useMemo } from "react";
import { useAuthStore } from "@/stores/authStore";
import type { AdminUser } from "../services/adminAuthService";

/**
 * Unified admin bridge — SINGLE SIGN-IN.
 *
 * The Partner app is the replacement for the legacy standalone admin portal,
 * so there is exactly one Firebase session (useAuthStore). This hook derives
 * the legacy `AdminUser` shape from that single session instead of a second
 * `useAdminAuthStore` login.
 *
 * - brand_owner / developer → full control-room access (`admin.developer`).
 * - regional_manager → full operational menus (dashboard/orders/stores/menu/
 *   customers/settings + petpooja/system read paths).
 * - Any other operator role that somehow reaches /admin → no menu perms
 *   (route gates deny first; this is defense-in-depth).
 */
const FULL_CONTROL_ROOM_PERMS = ["admin.developer"];

const REGIONAL_MANAGER_PERMS = [
  "admin.dashboard.view",
  "admin.orders.view",
  "admin.petpooja.sync",
  "admin.stores.view",
  "admin.menu.sync",
  "admin.coupons.manage",
  "admin.customer.view",
  "admin.settings.manage",
];

function permissionsForRole(roleName: string): string[] {
  if (roleName === "brand_owner" || roleName === "developer") return FULL_CONTROL_ROOM_PERMS;
  if (roleName === "regional_manager") return REGIONAL_MANAGER_PERMS;
  return [];
}

export function useAdmin() {
  const { user, firebaseUser, loading } = useAuthStore();

  const { admin, permissions, roleName, isDeveloper } = useMemo(() => {
    if (!user) {
      return { admin: null as AdminUser | null, permissions: [] as string[], roleName: "", isDeveloper: false };
    }
    const role = user.role;
    const permissions = permissionsForRole(role);
    const isDeveloper = role === "brand_owner" || role === "developer";
    const admin: AdminUser = {
      id: user.id,
      email: user.email,
      fullName: user.name,
      avatar: user.avatar ?? null,
      role: { name: role, permissions },
      assignedStoreId: user.branchIds?.[0],
    };
    return { admin, permissions, roleName: role, isDeveloper };
  }, [user]);

  // Legacy `accessToken` field: the old admin store minted it on its own
  // login. Under single sign-in the Firebase ID token is the credential —
  // callers that need it should call `firebaseUser.getIdToken()`. The system
  // diagnostic tabs only used it for a non-existent `/api/v1/admin/*`
  // endpoint (fail-closed, early-return on null), so null is safe here.
  const accessToken: string | null = null;

  const hasPermission = (permission: string) => {
    if (isDeveloper) return true;
    return permissions.includes(permission);
  };

  const hasAllPermissions = (perms: string[]) => {
    if (isDeveloper) return true;
    return perms.every((p) => permissions.includes(p));
  };

  const hasAnyPermission = (perms: string[]) => {
    if (isDeveloper) return true;
    return perms.some((p) => permissions.includes(p));
  };

  const hasRole = (role: string) => {
    if (isDeveloper) return true;
    return roleName === role;
  };

  return {
    admin,
    accessToken,
    firebaseUser,
    isLoading: loading,
    role: roleName,
    isDeveloper,
    permissions,
    hasPermission,
    hasAllPermissions,
    hasAnyPermission,
    hasRole,
  };
}

export function usePermission(permission: string): boolean {
  const { hasPermission } = useAdmin();
  return hasPermission(permission);
}

export function useRole(role: string): boolean {
  const { hasRole } = useAdmin();
  return hasRole(role);
}

interface RequirePermissionProps {
  permission: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export const RequirePermission: React.FC<RequirePermissionProps> = ({
  permission,
  fallback = null,
  children,
}) => {
  const isAllowed = usePermission(permission);
  return isAllowed ? <>{children}</> : <>{fallback}</>;
};

interface RequireRoleProps {
  role: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export const RequireRole: React.FC<RequireRoleProps> = ({ role, fallback = null, children }) => {
  const isAllowed = useRole(role);
  return isAllowed ? <>{children}</> : <>{fallback}</>;
};
