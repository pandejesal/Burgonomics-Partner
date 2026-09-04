import { useAuthStore } from '@/stores/authStore';
import type { UserRole } from '@/types';
import {
  LayoutDashboard,
  ClipboardList,
  Bike,
  Users,
  MessageSquare,
  Ticket,
  UtensilsCrossed,
  Building2,
  BarChart3,
  UserCheck,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  icon: LucideIcon;
  path: string;
  badge?: string;
  roles: UserRole[];
}

const navItems: NavItem[] = [
  {
    label: 'Dashboard',
    icon: LayoutDashboard,
    path: '/dashboard',
    roles: ['brand_owner', 'developer', 'support', 'regional_manager', 'branch_owner', 'branch_staff'],
  },
  {
    label: 'Live Orders',
    icon: ClipboardList,
    path: '/orders',
    roles: ['brand_owner', 'developer', 'support', 'regional_manager', 'branch_owner', 'branch_staff'],
  },
  {
    label: 'Delivery Queue',
    icon: Bike,
    path: '/delivery-queue',
    roles: ['brand_owner', 'developer', 'support', 'regional_manager', 'branch_owner', 'branch_staff'],
  },
  {
    label: 'Customer CRM',
    icon: Users,
    path: '/customers',
    roles: ['brand_owner', 'developer', 'support', 'regional_manager', 'branch_owner'],
  },
  {
    label: 'Chat Hub',
    icon: MessageSquare,
    path: '/chat',
    roles: ['brand_owner', 'developer', 'support', 'regional_manager', 'branch_owner', 'branch_staff'],
  },
  {
    label: 'Support Tickets',
    icon: Ticket,
    path: '/tickets',
    roles: ['brand_owner', 'developer', 'support', 'regional_manager', 'branch_owner', 'branch_staff'],
  },
  {
    label: 'Menu Catalog',
    icon: UtensilsCrossed,
    path: '/menu',
    roles: ['brand_owner', 'developer', 'support', 'regional_manager', 'branch_owner'],
  },
  {
    label: 'Store Network',
    icon: Building2,
    path: '/branches',
    roles: ['brand_owner', 'developer', 'support', 'regional_manager'],
  },
  {
    label: 'Analytics',
    icon: BarChart3,
    path: '/analytics',
    roles: ['brand_owner', 'developer', 'support', 'regional_manager', 'branch_owner'],
  },
  {
    label: 'Team & Staff',
    icon: UserCheck,
    path: '/users',
    roles: ['brand_owner', 'developer', 'support', 'regional_manager'],
  },
  {
    label: 'Settings',
    icon: Settings,
    path: '/settings',
    roles: ['brand_owner', 'developer', 'support', 'regional_manager', 'branch_owner'],
  },
];

export function useNavigation() {
  const { user } = useAuthStore();

  const filteredItems = navItems.filter(
    (item) => !user || item.roles.includes(user.role)
  );

  return { navItems: filteredItems };
}
