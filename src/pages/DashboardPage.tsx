import React, { useState, useMemo, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import { useOrders } from '@/hooks/useOrders';
import { useBranches } from '@/hooks/useBranches';
import {
  LiveStatsGrid,
  BranchSwitcher,
  ActiveOrdersPulse,
  QuickActionsBar,
  type DashboardMetrics,
} from '@/features/dashboard';
import { RecentOrders } from '@/components/dashboard/RecentOrders';
import { Spinner } from '@/components/ui/Spinner';

export function DashboardPage() {
  const { user } = useAuthStore();
  const { selectedBranchId, setSelectedBranchId } = useAppStore();
  const { orders = [], isLoading: isOrdersLoading } = useOrders();
  const { branches = [], isLoading: isBranchesLoading } = useBranches();

  const isSuperadmin = user?.role === 'brand_owner' || user?.role === 'developer';

  const [activeBranchId, setActiveBranchId] = useState<string>(
    // Loop 49/120: no hardcoded fallback branch — staff without an assigned
    // branch used to silently view branch_cg_road's data as if it were
    // theirs. Unassigned sees everything ('all'), honestly.
    isSuperadmin ? selectedBranchId || 'all' : user?.branchIds?.[0] || 'all'
  );

  // Single source of truth: header outlet switcher writes to appStore,
  // dashboard card mirrors it so the two selectors never drift apart.
  useEffect(() => {
    if (!isSuperadmin) return;
    const storeVal = selectedBranchId || 'all';
    setActiveBranchId((prev) => (prev !== storeVal ? storeVal : prev));
  }, [selectedBranchId, isSuperadmin]);

  // Filter orders by branch if selected
  const branchOrders = useMemo(() => {
    if (activeBranchId === 'all') return orders;
    return orders.filter((o) => o.branchId === activeBranchId);
  }, [orders, activeBranchId]);

  // Compute live metrics scoped to today (Asia/Kolkata local date)
  const metrics: DashboardMetrics = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayOrders = branchOrders.filter((o) => {
      const orderDate = (o.createdAt as any)?.toDate
        ? (o.createdAt as any).toDate()
        : (o.createdAt as any)?.toMillis
        ? new Date((o.createdAt as any).toMillis())
        : typeof o.createdAt === 'string' || typeof o.createdAt === 'number'
        ? new Date(o.createdAt)
        : new Date();
      return orderDate >= todayStart;
    });

    const paidOrders = todayOrders.filter(
      (o) => o.paymentStatus === 'completed' || (o.paymentStatus as string) === 'PAID'
    );

    const revenue = paidOrders.reduce((sum, o) => sum + (o.total || o.subtotal || 0), 0);
    const ordersCount = todayOrders.length;
    const aov = ordersCount > 0 ? Math.round(revenue / ordersCount) : 0;

    const inKitchen = branchOrders.filter(
      (o) =>
        o.status === 'preparing' ||
        (o.status as string) === 'in_progress' ||
        o.status === 'accepted'
    ).length;

    const inTransit = branchOrders.filter(
      (o) =>
        o.status === 'out_for_delivery' ||
        (o.status as string) === 'in_transit' ||
        (o.status as string) === 'dispatched'
    ).length;

    return {
      todayRevenue: revenue,
      todayOrdersCount: ordersCount,
      activeKitchenCount: inKitchen,
      inTransitCount: inTransit,
      averageOrderValue: aov,
    };
  }, [branchOrders]);

  const pendingKots = useMemo(() => {
    return branchOrders.filter((o) => o.status === 'pending' || (o.status as string) === 'new')
      .length;
  }, [branchOrders]);

  if (isOrdersLoading || isBranchesLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-neutral-400">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16 select-none">
      {/* 1. Branch Switcher & Online/Offline Master Switch */}
      <BranchSwitcher
        branches={branches}
        selectedBranchId={activeBranchId}
        isSuperadmin={isSuperadmin}
        onSelectBranch={(id) => {
          setActiveBranchId(id);
          setSelectedBranchId(id);
        }}
        onToggleStoreStatus={async (branchId, isAccepting) => {
          // Future: Firestore branch update
        }}
      />

      {/* 2. Active Orders / KDS Pulse Alert */}
      <ActiveOrdersPulse
        pendingKotCount={pendingKots}
        inPrepCount={metrics.activeKitchenCount}
      />

      {/* 3. Live Stats KPI Grid */}
      <LiveStatsGrid metrics={metrics} />

      {/* 4. Quick Actions Touch Shortcuts */}
      <QuickActionsBar />

      {/* 5. Live Recent Orders Feed */}
      <div className="space-y-3">
        <h2 className="text-sm font-black text-white uppercase tracking-wider">
          Live Orders Stream ({branchOrders.slice(0, 10).length})
        </h2>
        <RecentOrders orders={branchOrders.slice(0, 10)} />
      </div>
    </div>
  );
}

export default DashboardPage;
