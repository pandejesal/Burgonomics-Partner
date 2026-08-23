import type { BranchStats } from '@/hooks/useAnalytics';

interface BranchComparisonProps {
  branches: BranchStats[];
}

export function BranchComparison({ branches }: BranchComparisonProps) {
  const maxRevenue = Math.max(...branches.map((b) => b.revenue), 1);

  return (
    <div className="bg-surface rounded-2xl border border-border p-6 shadow-xs">
      <h3 className="font-semibold text-text-primary mb-4">
        Branch Performance Benchmark
      </h3>
      <div className="space-y-4">
        {branches.length === 0 ? (
          <p className="text-text-secondary text-center py-6 text-sm">
            No branch comparative data available
          </p>
        ) : (
          branches.map((branch) => {
            const percentage = Math.min(
              100,
              Math.max(4, Math.round((branch.revenue / maxRevenue) * 100))
            );

            return (
              <div key={branch.branchId} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-text-primary truncate">
                    {branch.branchName}
                  </span>
                  <span className="font-bold text-primary whitespace-nowrap ml-2">
                    ₹{branch.revenue.toLocaleString()}
                  </span>
                </div>
                <div className="w-full h-2.5 bg-primary/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-500"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <div className="flex justify-between items-center text-xs text-text-secondary">
                  <span>{branch.orders} total orders</span>
                  <span>
                    Avg ticket: ₹
                    {branch.orders > 0
                      ? Math.round(branch.revenue / branch.orders)
                      : 0}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
