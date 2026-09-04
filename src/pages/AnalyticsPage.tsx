import { useState } from 'react';
import { useAnalytics } from '@/hooks/useAnalytics';
import { exportToCsv } from '@/utils/exportCsv';
import { RevenueChart } from '@/components/analytics/RevenueChart';
import { TopItems } from '@/components/analytics/TopItems';
import { BranchComparison } from '@/components/analytics/BranchComparison';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { Spinner } from '@/components/ui/Spinner';
import { DollarSign, ClipboardList, TrendingUp } from 'lucide-react';

export function AnalyticsPage() {
  const [period, setPeriod] = useState<'week' | 'month' | 'year'>('month');
  const { data: analytics, isLoading } = useAnalytics(period);

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Period Switcher */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Performance Analytics</h1>
          <p className="text-sm text-text-secondary">
            Revenue trends, sales volume, item popularity, and outlet metrics.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              exportToCsv('Burgonomics_Sales_Analytics', (analytics?.branchStats || []) as any[], [
                { header: 'Branch Name', accessor: (b: any) => b.branchName },
                { header: 'City', accessor: (b: any) => b.city || 'N/A' },
                { header: 'Total Orders', accessor: (b: any) => b.orderCount },
                { header: 'Total Revenue (INR)', accessor: (b: any) => b.revenue },
                { header: 'Average Order Value (INR)', accessor: (b: any) => Math.round(b.averageOrderValue || 0) },
              ]);
            }}
            className="flex items-center gap-2 px-3.5 py-2 bg-[#D95D0F] hover:bg-[#b84d0b] text-white rounded-xl font-semibold text-xs transition-colors shadow-sm cursor-pointer"
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Export Analytics (.csv)</span>
          </button>

          <div className="flex gap-1.5 p-1 bg-surface rounded-xl border border-border">
            {(['week', 'month', 'year'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  period === p
                    ? 'bg-primary text-white shadow-xs'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : 'Past Year'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatsCard
          title="Total Revenue"
          value={`₹${(analytics?.totalRevenue || 0).toLocaleString()}`}
          icon={DollarSign}
          color="primary"
        />
        <StatsCard
          title="Total Orders"
          value={analytics?.totalOrders || 0}
          icon={ClipboardList}
          color="secondary"
        />
        <StatsCard
          title="Average Order Value"
          value={`₹${Math.round(analytics?.averageOrderValue || 0).toLocaleString()}`}
          icon={TrendingUp}
          color="accent"
        />
      </div>

      {/* Primary Visualizations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RevenueChart data={analytics?.dailyRevenue || []} />
        <TopItems items={analytics?.topItems || []} />
      </div>

      {/* Multi-Branch Benchmarking */}
      <BranchComparison branches={analytics?.branchStats || []} />
    </div>
  );
}

export default AnalyticsPage;
