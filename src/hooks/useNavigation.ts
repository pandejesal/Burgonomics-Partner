import { useAuth } from '@/hooks/useAuth';
import type { UserRole } from '@/types';
import {
  LayoutDashboard,
  ClipboardList,
  Users,
  Ticket,
  UtensilsCrossed,
  Building2,
  BarChart3,
  UserCheck,
  Settings,
  type LucideIcon,
} from 'lucide-react';

interface NavItem {
  label: string;
  icon: LucideIcon;
  path: string;
  roles: UserRole[];
}

const navItems: NavItem[] = [
  {
    label: 'Dashboard',
    icon: LayoutDashboard,
    path: '/dashboard',
    roles: ['brand_owner', 'regional_manager', 'branch_owner'],
  },
  {
    label: 'Orders',
    icon: ClipboardList,
    path: '/orders',
    roles: ['brand_owner', 'regional_manager', 'branch_owner'],
  },
  {
    label: 'Customers',
    icon: Users,
    path: '/customers',
    roles: ['brand_owner', 'regional_manager', 'branch_owner'],
  },
  {
    label: 'Tickets',
    icon: Ticket,
    path: '/tickets',
    roles: ['brand_owner', 'regional_manager', 'branch_owner'],
  },
  {
    label: 'Menu',
    icon: UtensilsCrossed,
    path: '/menu',
    roles: ['brand_owner', 'regional_manager', 'branch_owner'],
  },
  {
    label: 'All Branches',
    icon: Building2,
    path: '/branches',
    roles: ['brand_owner'],
  },
  {
    label: 'Analytics',
    icon: BarChart3,
    path: '/analytics',
    roles: ['brand_owner', 'regional_manager'],
  },
  {
    label: 'Team Members',
    icon: UserCheck,
    path: '/users',
    roles: ['brand_owner', 'regional_manager'],
  },
  {
    label: 'Settings',
    icon: Settings,
    path: '/settings',
    roles: ['brand_owner', 'regional_manager', 'branch_owner'],
  },
];

export function useNavigation() {
  const { user } = useAuth();

  const filteredItems = navItems.filter(
    (item) => user && item.roles.includes(user.role)
  );

  return { navItems: filteredItems };
}
