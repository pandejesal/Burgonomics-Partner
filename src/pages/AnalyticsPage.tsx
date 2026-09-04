import React, { useState } from 'react';
import { useAnalytics } from '@/hooks/useAnalytics';
import { exportToCsv } from '@/utils/exportCsv';
import { RevenueChart } from '@/components/analytics/RevenueChart';
import { HourlyRushHeatmap } from '@/components/analytics/HourlyRushHeatmap';
import { FulfillmentDonut } from '@/components/analytics/FulfillmentDonut';
import { TopItems } from '@/components/analytics/TopItems';
import { RoyaltyLedger } from '@/components/analytics/RoyaltyLedger';
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
  const { data: analytics, isLoading } = useAnalytics(period);

  if (isLoading || !analytics) {
    return (
      <div className="flex justify-center py-24">
        <Spinner size="lg" />
      </div>
    );
  }

  const handleExportCsv = () => {
    const rows = analytics.branchStats.map((b) => ({
      branchName: b.branchName,
      city: b.city,
      grossRevenue: b.revenue,
      brandRoyalty5Percent: b.brandRoyalty,
      netBranchPayout95Percent: b.netBranchPayout,
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
        { header: 'Gross Revenue (INR)', accessor: (r: any) => r.grossRevenue },
        { header: 'Brand Royalty Retained (5% INR)', accessor: (r: any) => r.brandRoyalty5Percent },
        { header: 'Net Branch Payout (95% INR)', accessor: (r: any) => r.netBranchPayout95Percent },
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
            Gross sales velocity, Razorpay Route 5% royalty ledger, peak rush heatmaps, and Porter logistics audit
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
            <span>Brand Royalty (5%)</span>
            <Building className="w-4 h-4 text-purple-400" />
          </div>
          <div className="font-mono font-black text-xl text-purple-400 mt-2">
            ₹{analytics.brandRoyaltyEarned.toLocaleString()}
          </div>
          <div className="text-[10px] text-zinc-400 mt-1">Headquarters Licensing Fee</div>
        </div>
        <div className="bg-surface p-5 rounded-2xl border border-border flex flex-col justify-between shadow-xl">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-bold">
            <span>Net Branch Payout (95%)</span>
            <Store className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="font-mono font-black text-xl text-emerald-400 mt-2">
            ₹{analytics.netBranchPayoutTotal.toLocaleString()}
          </div>
          <div className="text-[10px] text-zinc-400 mt-1">Direct to Linked Accounts</div>
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

      {/* Row 3: Razorpay Route Royalty Ledger */}
      <RoyaltyLedger
        branches={analytics.branchStats}
        totalRevenue={analytics.totalRevenue}
        brandRoyalty={analytics.brandRoyaltyEarned}
        netBranchPayout={analytics.netBranchPayoutTotal}
      />

      {/* Row 4: Multi-Branch Performance Benchmarking */}
      <BranchComparison branches={analytics.branchStats} />
    </div>
  );
}

export default AnalyticsPage;
