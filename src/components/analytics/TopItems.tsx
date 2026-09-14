import type { TopItem } from '@/hooks/useAnalytics';
import { Award, Flame, Sparkles } from 'lucide-react';

interface TopItemsProps {
  items: TopItem[];
}

export function TopItems({ items }: TopItemsProps) {
  const maxRevenue = items[0]?.revenue || 1;

  return (
    <div className="bg-surface rounded-2xl border border-border p-6 shadow-xl space-y-4 select-none">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-surface-hover text-accent-light border border-border">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-white text-base tracking-wide">Top-Selling Items Velocity</h3>
            <p className="text-xs text-zinc-400">Popularity and revenue generation by SKU</p>
          </div>
        </div>

        <span className="px-2.5 py-1 rounded-xl bg-bg border border-border text-[10px] font-bold text-emerald-400">
          Pure Veg Menu
        </span>
      </div>

      <div className="space-y-3">
        {items.length === 0 ? (
          <p className="text-zinc-500 text-center py-8 text-xs">
            No item sales data recorded for this timeframe
          </p>
        ) : (
          items.map((item, index) => {
            const widthPercent = Math.round((item.revenue / maxRevenue) * 100);

            return (
              <div
                key={index}
                className="bg-bg p-3 rounded-xl border border-border hover:border-accent/60 transition-all space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${
                        index === 0
                          ? 'bg-accent text-white shadow-sm'
                          : index === 1
                          ? 'bg-amber-600 text-white'
                          : index === 2
                          ? 'bg-surface-hover text-emerald-300 border border-[#2e5e39]'
                          : 'bg-[#112415] text-zinc-400'
                      }`}
                    >
                      {index + 1}
                    </span>

                    {item.image && (
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-8 h-8 rounded-lg object-cover border border-border shrink-0"
                      />
                    )}

                    <div className="min-w-0">
                      <p className="font-bold text-white text-xs truncate flex items-center gap-1.5">
                        <span>{item.name}</span>
                        {index === 0 && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-accent/20 text-accent-light border border-accent/40 flex items-center gap-0.5">
                            <Flame className="w-2.5 h-2.5" />
                            #1 BESTSELLER
                          </span>
                        )}
                      </p>
                      <p className="text-[10px] text-zinc-400">
                        {item.category} • <strong className="text-zinc-200">{item.quantity} units sold</strong>
                      </p>
                    </div>
                  </div>

                  <p className="font-black text-white text-xs whitespace-nowrap ml-4 font-mono">
                    ₹{item.revenue.toLocaleString()}
                  </p>
                </div>

                {/* Progress bar velocity */}
                <div className="w-full bg-[#112415] h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-accent to-emerald-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${widthPercent}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default TopItems;
