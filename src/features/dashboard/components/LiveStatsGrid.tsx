import React from 'react';
import { IndianRupee, Receipt, Flame, Bike } from 'lucide-react';

/** Scoped-to-today KPIs computed by the page from the orders stream. */
export interface DashboardMetrics {
  todayRevenue: number;
  todayOrdersCount: number;
  activeKitchenCount: number;
  inTransitCount: number;
  averageOrderValue: number;
}

interface LiveStatsGridProps {
  metrics: DashboardMetrics;
}

/**
 * LiveStatsGrid — presentational KPI grid. All numbers arrive via `metrics`
 * (computed in DashboardPage from the orders stream); this component renders
 * them and invents nothing.
 */
export function LiveStatsGrid({ metrics }: LiveStatsGridProps) {
  const cards = [
    {
      label: "Today's Revenue",
      value: `₹${metrics.todayRevenue.toLocaleString('en-IN')}`,
      sub: `AOV ₹${metrics.averageOrderValue.toLocaleString('en-IN')}`,
      icon: IndianRupee,
      valueClass: 'text-emerald-400',
      iconClass: 'text-emerald-400',
    },
    {
      label: "Today's Orders",
      value: String(metrics.todayOrdersCount),
      sub: 'Kolkata day boundary',
      icon: Receipt,
      valueClass: 'text-white',
      iconClass: 'text-blue-400',
    },
    {
      label: 'In Kitchen',
      value: String(metrics.activeKitchenCount),
      sub: 'accepted / preparing',
      icon: Flame,
      valueClass: 'text-amber-400',
      iconClass: 'text-amber-400',
    },
    {
      label: 'In Transit',
      value: String(metrics.inTransitCount),
      sub: 'out for delivery',
      icon: Bike,
      valueClass: 'text-cyan-400',
      iconClass: 'text-cyan-400',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 space-y-1"
          >
            <div className="flex items-center justify-between text-neutral-400">
              <span className="text-[10px] font-bold uppercase tracking-wider">{card.label}</span>
              <Icon className={`w-4 h-4 ${card.iconClass}`} />
            </div>
            <p className={`text-2xl font-black ${card.valueClass}`}>{card.value}</p>
            <p className="text-[11px] text-neutral-500">{card.sub}</p>
          </div>
        );
      })}
    </div>
  );
}

export default LiveStatsGrid;
