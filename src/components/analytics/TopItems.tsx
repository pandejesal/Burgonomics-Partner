import type { TopItem } from '@/hooks/useAnalytics';

interface TopItemsProps {
  items: TopItem[];
}

export function TopItems({ items }: TopItemsProps) {
  return (
    <div className="bg-surface rounded-2xl border border-border p-6 shadow-xs">
      <h3 className="font-semibold text-text-primary mb-4">Top Selling Items</h3>
      <div className="space-y-3">
        {items.length === 0 ? (
          <p className="text-text-secondary text-center py-8 text-sm">
            No item sales data yet
          </p>
        ) : (
          items.map((item, index) => (
            <div
              key={index}
              className="flex items-center justify-between py-2 border-b border-border/60 last:border-0"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="font-medium text-text-primary text-sm truncate">
                    {item.name}
                  </p>
                  <p className="text-xs text-text-secondary">
                    {item.quantity} units sold
                  </p>
                </div>
              </div>
              <p className="font-bold text-primary text-sm whitespace-nowrap ml-4">
                ₹{item.revenue.toLocaleString()}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
