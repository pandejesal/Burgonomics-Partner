import React, { useState } from 'react';
import { useAnalytics } from '@/hooks/useAnalytics';
import { exportToCsv } from '@/utils/exportCsv';
import { RevenueChart } from '@/components/analytics/RevenueChart';
import { HourlyRushHeatmap } from '@/components/analytics/HourlyRushHeatmap';
import { FulfillmentDonut } from '@/components/analytics/FulfillmentDonut';
import { TopItems } from '@/components/analytics/TopItems';
import { MonthlyBranchStatement } from '@/components/analytics/MonthlyBranchStatement';
import { BranchComparison } from '@/components/analytics/BranchComparison';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { Spinner } from '@/components/ui/Spinner';
import { DataWarningBanner } from '@/components/ui/DataWarningBanner';
import {
  DollarSign,
  ClipboardList,
  TrendingUp,
  Download,
  Building,
  Store,
  ShieldCheck,
  Zap,
} from 'lucide-react';

export function AnalyticsPage() {
  const [period, setPeriod] = useState<'week' | 'month' | 'year'>('month');
  const { data: analytics, isLoading, isError, refetch } = useAnalytics(period);

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner size="lg" />
      </div>
    );
  }

  if (isError || !analytics) {
    return (
      <div role="alert" className="bg-surface border border-border rounded-2xl p-6 space-y-3">
        <h1 className="font-bold text-text-primary">Analytics unavailable</h1>
        <p className="text-sm text-text-secondary">We could not load analytics. Please try again.</p>
        <button type="button" onClick={() => void refetch()} className="min-h-11 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-xl font-bold text-sm focus-visible:outline-2 focus-visible:outline-accent">
          Retry
        </button>
      </div>
    );
  }

  const handleExportCsv = () => {
    const rows = analytics.branchStats.map((b) => ({
      branchName: b.branchName,
      city: b.city,
      grossRevenue: b.revenue,
      razorpayRevenue: b.razorpayRevenue,
      razorpayOrders: b.razorpayOrders,
      cashCounterRevenue: b.cashRevenue,
      cashCounterOrders: b.cashOrders,
      unpaidOrders: b.unpaidOrders,
      totalOrders: b.orders,
      averageOrderValue: b.averageOrderValue,
      deliveryOrders: b.deliveryOrders,
      takeawayOrders: b.takeawayOrders,
      dineinOrders: b.dineinOrders,
      linkedAccountId: b.linkedAccountId,
      status: b.linkedStatus,
    }));

    exportToCsv(
      `Burgonomics_Financial_Reconciliation_${period.toUpperCase()}_${new Date().toISOString().slice(0, 10)}`,
      rows,
      [
        { header: 'Branch Name', accessor: (r: any) => r.branchName },
        { header: 'City', accessor: (r: any) => r.city },
        { header: 'Total Earnings (INR)', accessor: (r: any) => r.grossRevenue },
        { header: 'Razorpay Earnings (INR)', accessor: (r: any) => r.razorpayRevenue },
        { header: 'Razorpay Orders', accessor: (r: any) => r.razorpayOrders },
        { header: 'Cash & Counter (INR)', accessor: (r: any) => r.cashCounterRevenue },
        { header: 'Cash & Counter Orders', accessor: (r: any) => r.cashCounterOrders },
        { header: 'Unpaid Online Orders', accessor: (r: any) => r.unpaidOrders },
        { header: 'Total Orders', accessor: (r: any) => r.totalOrders },
        { header: 'AOV (INR)', accessor: (r: any) => r.averageOrderValue },
        { header: 'Delivery Orders', accessor: (r: any) => r.deliveryOrders },
        { header: 'Takeaway Orders', accessor: (r: any) => r.takeawayOrders },
        { header: 'Dine-In Orders', accessor: (r: any) => r.dineinOrders },
        { header: 'Razorpay Linked Account', accessor: (r: any) => r.linkedAccountId },
        { header: 'Reconciliation Status', accessor: (r: any) => r.status },
      ]
    );
  };

  return (
    <div className="space-y-6 select-none">
      <DataWarningBanner warnings={analytics.warnings} />
      {/* Top Header & Period Switcher */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-white tracking-wide">
              Revenue Analytics & Operational Reporting
            </h1>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-accent/20 text-accent-light border border-accent/40 font-mono uppercase">
              Financial Suite
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            Gross sales velocity, separate Razorpay and Cash & counter earnings, peak rush heatmaps, and courier logistics audit
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
          {/* CSV Export Button */}
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-2 px-3.5 py-2 bg-accent hover:bg-accent-hover text-white rounded-xl font-bold text-xs transition-colors shadow-md cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Financial Report (.csv)</span>
          </button>

          {/* Timeframe Selector */}
          <div className="flex gap-1 p-1 bg-[#112415] rounded-xl border border-border">
            {(['week', 'month', 'year'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  period === p
                    ? 'bg-accent text-white shadow-xs'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : 'Past Year'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Executive KPI Cards (5 Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        <StatsCard
          title="Total Gross Revenue"
          value={`₹${analytics.totalRevenue.toLocaleString()}`}
          icon={DollarSign}
          color="primary"
        />
        <StatsCard
          title="Total Orders"
          value={analytics.totalOrders}
          icon={ClipboardList}
          color="secondary"
        />
        <StatsCard
          title="Average Order Value"
          value={`₹${analytics.averageOrderValue.toLocaleString()}`}
          icon={TrendingUp}
          color="accent"
        />
        <div className="bg-surface p-5 rounded-2xl border border-border flex flex-col justify-between shadow-xl">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-bold">
            <span>Razorpay Earnings</span>
            <Building className="w-4 h-4 text-purple-400" />
          </div>
          <div className="font-mono font-black text-xl text-purple-400 mt-2">
            ₹{analytics.razorpayRevenue.toLocaleString()}
          </div>
          <div className="text-[10px] text-zinc-400 mt-1">
            {analytics.razorpayOrders} gateway-paid order{analytics.razorpayOrders === 1 ? '' : 's'}
          </div>
        </div>
        <div className="bg-surface p-5 rounded-2xl border border-border flex flex-col justify-between shadow-xl">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-bold">
            <span>Cash &amp; Counter</span>
            <Store className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="font-mono font-black text-xl text-emerald-400 mt-2">
            ₹{analytics.cashRevenue.toLocaleString()}
          </div>
          <div className="text-[10px] text-zinc-400 mt-1">
            {analytics.cashOrders} completed order{analytics.cashOrders === 1 ? '' : 's'}
            {analytics.cashPendingOrders > 0
              ? ` · ${analytics.cashPendingOrders} in progress (not earned)`
              : ''}
            {analytics.unpaidOrders > 0 ? ` · ${analytics.unpaidOrders} unpaid (₹0)` : ''}
          </div>
        </div>
      </div>

      {/* Row 1: Revenue Chart & Hourly Rush Heatmap */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RevenueChart data={analytics.dailyRevenue} />
        <HourlyRushHeatmap data={analytics.hourlyRush} />
      </div>

      {/* Row 2: 3-Way Fulfillment Breakdown & Top Items */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <FulfillmentDonut
          breakdown={analytics.fulfillmentBreakdown}
          logistics={analytics.logistics}
        />
        <TopItems items={analytics.topItems} />
      </div>

      {/* Row 3: monthly branch statement (fixed fee) */}
      <MonthlyBranchStatement
        current={analytics.monthlyStatements.current}
        previous={analytics.monthlyStatements.previous}
      />

      {/* Row 4: Multi-Branch Performance Benchmarking */}
      <BranchComparison branches={analytics.branchStats} />
    </div>
  );
}

export default AnalyticsPage;
