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
import { AlertTriangle } from 'lucide-react';

/** Start of the current day in Asia/Kolkata as an absolute instant (IST has no DST). */
function kolkataTodayStart(): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return new Date(`${get('year')}-${get('month')}-${get('day')}T00:00:00+05:30`);
}

function ageLabel(fromMs: number): string {
  const s = Math.max(0, Math.round((Date.now() - fromMs) / 1000));
  return s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`;
}

export function DashboardPage() {
  const { user } = useAuthStore();
  const { selectedBranchId, setSelectedBranchId } = useAppStore();
  const {
    orders = [],
    isLoading: isOrdersLoading,
    error: ordersError,
    refetch: refetchOrders,
    dataUpdatedAt,
  } = useOrders();
  const {
    branches = [],
    isLoading: isBranchesLoading,
    updateBranchSettings,
  } = useBranches();

  const isSuperadmin = user?.role === 'brand_owner' || user?.role === 'developer';

  const [activeBranchId, setActiveBranchId] = useState<string>(
    isSuperadmin ? selectedBranchId || 'all' : user?.branchIds?.[0] || 'branch_cg_road'
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
    const todayStart = kolkataTodayStart();

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

  const quarantined = useMemo(() => {
    return branchOrders.filter((o) => o.status === 'quarantine');
  }, [branchOrders]);

  if (isOrdersLoading || isBranchesLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-neutral-400">
        <Spinner size="lg" />
      </div>
    );
  }

  // Dead backend must never render green "Live" metrics — error state with retry.
  if (ordersError) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto pb-16 select-none">
        <div
          role="alert"
          className="rounded-2xl border border-rose-900/50 bg-rose-950/20 p-8 text-center space-y-3"
        >
          <AlertTriangle className="w-10 h-10 mx-auto text-rose-400" />
          <h2 className="font-bold text-white text-sm">Orders failed to load</h2>
          <p className="text-xs text-zinc-400">
            {(ordersError as Error)?.message || 'Check connection and permissions, then retry.'}
          </p>
          <p className="text-[11px] text-zinc-500">
            Metrics below would be stale — they are hidden until fresh data arrives.
          </p>
          <button
            type="button"
            onClick={() => refetchOrders()}
            className="px-4 py-2 rounded-xl bg-[#0E4825] text-emerald-300 font-bold text-xs cursor-pointer"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16 select-none">
      {/* 1. Branch Switcher & Online/Offline Master Switch (wired to Firestore) */}
      <BranchSwitcher
        branches={branches.map((b) => ({
          id: b.id,
          name: b.name,
          city: b.city,
          isAcceptingOrders: b.active !== false && b.acceptingOrdersStatus !== 'closed',
        }))}
        selectedBranchId={activeBranchId}
        isSuperadmin={isSuperadmin}
        onSelectBranch={(id) => {
          setActiveBranchId(id);
          setSelectedBranchId(id);
        }}
        onToggleStoreStatus={async (branchId, isAccepting) => {
          await updateBranchSettings.mutateAsync({
            branchId,
            settings: { acceptingOrdersStatus: isAccepting ? 'open' : 'closed' },
          });
        }}
      />

      {/* Honest data-age label: time since the last successful orders fetch. */}
      <p className="text-[11px] text-zinc-500 font-mono" title="Last successful orders fetch">
        Data {dataUpdatedAt ? ageLabel(dataUpdatedAt) : 'not yet loaded'}
      </p>

      {quarantined.length > 0 && (
        <div
          role="alert"
          className="rounded-2xl border border-amber-800/60 bg-amber-950/30 p-4 text-xs text-amber-200 space-y-1"
        >
          <p className="font-bold">
            {quarantined.length} order{quarantined.length === 1 ? '' : 's'} need{quarantined.length === 1 ? 's' : ''} review
            (unrecognized or corrupt data — held out of kitchen counts)
          </p>
          {quarantined.slice(0, 3).map((o) => (
            <p key={o.id} className="font-mono text-[11px] text-amber-300/80">
              {o.id.slice(0, 8)} — {o.quarantineReason || 'unknown status'}
            </p>
          ))}
        </div>
      )}

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
