import { useAuthStore } from '@/stores/authStore';
import type { UserRole } from '@/types';
import { rolesForRoute } from '@/core/auth/routePolicy';
import {
  LayoutDashboard,
  ClipboardList,
  ChefHat,
  Bike,
  Users,
  MessageSquare,
  Ticket,
  UtensilsCrossed,
  Building2,
  BarChart3,
  UserCheck,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  icon: LucideIcon;
  path: string;
  badge?: string;
  roles: UserRole[];
}

interface NavBaseItem {
  label: string;
  icon: LucideIcon;
  path: string;
  badge?: string;
}

// Sidebar order is presentation only. Visibility is NOT listed here — it is
// derived from the enforced route policy (routePolicy.rolesForRoute), so the
// sidebar can never offer a route the guard denies.
const navBaseItems: NavBaseItem[] = [
  {
    label: 'Dashboard',
    icon: LayoutDashboard,
    path: '/dashboard',
  },
  {
    label: 'Live Orders',
    icon: ClipboardList,
    path: '/orders',
  },
  {
    label: 'Kitchen KDS',
    icon: ChefHat,
    path: '/kds',
  },
  {
    label: 'Delivery Queue',
    icon: Bike,
    path: '/delivery-queue',
  },
  {
    label: 'Customer CRM',
    icon: Users,
    path: '/customers',
  },
  {
    label: 'Chat Hub',
    icon: MessageSquare,
    path: '/chat',
  },
  {
    label: 'Support Tickets',
    icon: Ticket,
    path: '/tickets',
  },
  {
    label: 'Menu Catalog',
    icon: UtensilsCrossed,
    path: '/menu',
  },
  {
    label: 'Store Network',
    icon: Building2,
    path: '/branches',
  },
  {
    label: 'Analytics',
    icon: BarChart3,
    path: '/analytics',
  },
  {
    label: 'Team & Staff',
    icon: UserCheck,
    path: '/users',
  },
  {
    // Migrated Control Room (former standalone admin portal, 44 pages).
    // Single sign-in — visible only to brand-level roles permitted by
    // AdminPortalLayout + routePolicy (/admin stays denied for branch/support).
    label: 'Control Room',
    icon: ShieldCheck,
    path: '/admin',
  },
  {
    label: 'Settings',
    icon: Settings,
    path: '/settings',
  },
];

// Single source of truth: each item's roles ARE the policy allowlist for its
// path. Exported for the nav/policy parity test.
export const navItems: NavItem[] = navBaseItems.map((item) => ({
  ...item,
  roles: rolesForRoute(item.path),
}));

export function useNavigation() {
  const { user } = useAuthStore();

  const filteredItems = user ? navItems.filter((item) => item.roles.includes(user.role)) : [];

  return { navItems: filteredItems };
}
