import {
  ClipboardList,
  DollarSign,
  Users,
  Ticket,
  TrendingUp,
  ShoppingBag,
} from 'lucide-react';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { RecentOrders } from '@/components/dashboard/RecentOrders';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { Spinner } from '@/components/ui/Spinner';

export function DashboardPage() {
  const { data: stats, isLoading, error } = useDashboardStats();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center text-red-500 p-6">
        Error loading dashboard: {(error as Error).message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Total Orders"
          value={stats?.totalOrders || 0}
          icon={ClipboardList}
          color="primary"
        />
        <StatsCard
          title="Revenue"
          value={stats?.totalRevenue || 0}
          icon={DollarSign}
          color="secondary"
        />
        <StatsCard
          title="Customers"
          value={stats?.totalCustomers || 0}
          icon={Users}
          color="accent"
        />
        <StatsCard
          title="Open Tickets"
          value={stats?.openTickets || 0}
          icon={Ticket}
          color="red"
        />
      </div>

      {/* Today's Stats */}
      <div className="grid grid-cols-2 gap-4">
        <StatsCard
          title="Orders Today"
          value={stats?.ordersToday || 0}
          icon={ShoppingBag}
          color="primary"
        />
        <StatsCard
          title="Revenue Today"
          value={stats?.revenueToday || 0}
          icon={TrendingUp}
          color="secondary"
        />
      </div>

      {/* Quick Actions */}
      <QuickActions />

      {/* Recent Orders */}
      <RecentOrders orders={stats?.recentOrders || []} />
    </div>
  );
}
