import type { BranchStats } from '@/hooks/useAnalytics';
import { Store, Building, TrendingUp } from 'lucide-react';

interface BranchComparisonProps {
  branches: BranchStats[];
}

export function BranchComparison({ branches }: BranchComparisonProps) {
  const maxRevenue = Math.max(...branches.map((b) => b.revenue), 1);

  return (
    <div className="bg-surface rounded-2xl border border-border p-6 shadow-xl space-y-5 select-none">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-surface-hover text-accent-light border border-border">
            <Building className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-white text-base tracking-wide">
              Branch Performance Benchmarking
            </h3>
            <p className="text-xs text-zinc-400">
              Comparative gross revenue, average tickets, and channel shares across outlets
            </p>
          </div>
        </div>

        <span className="px-2.5 py-1 rounded-xl bg-bg border border-border text-[10px] font-mono text-zinc-400">
          {branches.length} Active Outlets
        </span>
      </div>

      <div className="space-y-4">
        {branches.length === 0 ? (
          <p className="text-zinc-500 text-center py-6 text-xs">
            No branch comparative data available
          </p>
        ) : (
          branches.map((branch) => {
            const percentage = Math.min(
              100,
              Math.max(4, Math.round((branch.revenue / maxRevenue) * 100))
            );

            return (
              <div
                key={branch.branchId}
                className="bg-bg p-4 rounded-xl border border-border space-y-2.5"
              >
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Store className="w-4 h-4 text-accent-light" />
                    <span className="font-bold text-white text-sm">{branch.branchName}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#112415] text-zinc-400 border border-border">
                      {branch.city}
                    </span>
                  </div>

                  <span className="font-black text-white text-sm font-mono">
                    ₹{branch.revenue.toLocaleString()}
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="w-full h-2 bg-[#112415] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-accent to-emerald-500 rounded-full transition-all duration-500"
                    style={{ width: `${percentage}%` }}
                  />
                </div>

                <div className="flex flex-wrap justify-between items-center text-[11px] text-zinc-400 pt-1">
                  <div className="flex items-center gap-3">
                    <span>{branch.orders} total orders</span>
                    <span>•</span>
                    <span>🛵 {branch.deliveryOrders} Delivery</span>
                    <span>•</span>
                    <span>🛍️ {branch.takeawayOrders} Takeaway</span>
                  </div>

                  <div>
                    Avg Ticket: <strong className="text-white font-mono">₹{branch.averageOrderValue}</strong>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default BranchComparison;
