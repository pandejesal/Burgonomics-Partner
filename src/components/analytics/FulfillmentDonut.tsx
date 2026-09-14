import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from 'recharts';
import type { ChannelStat, LogisticsSummary } from '@/hooks/useAnalytics';
import { Bike, ShoppingBag, UtensilsCrossed, TrendingUp, ShieldCheck } from 'lucide-react';

interface FulfillmentDonutProps {
  breakdown: ChannelStat[];
  logistics: LogisticsSummary;
}

const COLORS = ['#D95D0F', '#2E5E39', '#4ADE80'];

export function FulfillmentDonut({ breakdown, logistics }: FulfillmentDonutProps) {
  const chartData = breakdown.map((b) => ({
    name: b.label,
    value: b.orders,
    revenue: b.revenue,
    percentage: b.percentage,
  }));

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case 'delivery':
        return <Bike className="w-4 h-4 text-accent-light" />;
      case 'takeaway':
        return <ShoppingBag className="w-4 h-4 text-emerald-400" />;
      default:
        return <UtensilsCrossed className="w-4 h-4 text-cyan-400" />;
    }
  };

  return (
    <div className="bg-surface rounded-2xl border border-border p-6 shadow-xl space-y-5 select-none">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-surface-hover text-accent-light border border-border">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-white text-base tracking-wide">
              3-Way Fulfillment Breakdown
            </h3>
            <p className="text-xs text-zinc-400">
              Delivery vs Takeaway vs Dine-In channel distribution and Porter logistics audit
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* Donut Chart */}
        <div className="lg:col-span-5 h-52 relative flex items-center justify-center">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip
                formatter={(value: any, name: any) => [`${value} orders`, `${name}`]}
                contentStyle={{
                  backgroundColor: '#0D0F0D',
                  borderRadius: '12px',
                  border: '1px solid #234B2A',
                  fontSize: '12px',
                  color: '#FFFFFF',
                }}
              />
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={80}
                paddingAngle={4}
                dataKey="value"
              >
                {chartData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>

          {/* Center Summary */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
            <span className="text-[10px] uppercase font-bold text-zinc-400">Total Orders</span>
            <span className="text-lg font-black text-white font-mono">
              {breakdown.reduce((sum, b) => sum + b.orders, 0)}
            </span>
          </div>
        </div>

        {/* 3 Channel Cards */}
        <div className="lg:col-span-7 grid grid-cols-1 gap-2.5">
          {breakdown.map((item, idx) => (
            <div
              key={item.channel}
              className="bg-bg p-3.5 rounded-xl border border-border flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-[#112415] border border-border">
                  {getChannelIcon(item.channel)}
                </div>
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-2">
                    <span>{item.label}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-surface-hover text-emerald-300 font-mono">
                      {item.percentage}%
                    </span>
                  </div>
                  <div className="text-[10px] text-zinc-400">
                    {item.orders} orders • Avg Ticket: <strong className="text-zinc-200">₹{item.avgTicket}</strong>
                  </div>
                </div>
              </div>

              <div className="text-right font-mono font-bold text-xs text-white">
                ₹{item.revenue.toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Porter Logistics Courier Cost Reconciliation */}
      <div className="bg-bg p-4 rounded-xl border border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-white">Porter Logistics Reconciliation</span>
            <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
              Positive Margin
            </span>
          </div>
          <p className="text-[10px] text-zinc-400">
            {logistics.totalDeliveryTrips} Porter delivery trips dispatched (Avg {logistics.avgDeliveryDistanceKm} km per trip)
          </p>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono">
          <div>
            <span className="text-[10px] text-zinc-400 block">Customer Fees</span>
            <span className="text-white font-bold">₹{logistics.deliveryFeesCollected.toLocaleString()}</span>
          </div>
          <span className="text-zinc-600">-</span>
          <div>
            <span className="text-[10px] text-zinc-400 block">Porter Cost</span>
            <span className="text-rose-400 font-bold">₹{logistics.porterIncurredCost.toLocaleString()}</span>
          </div>
          <span className="text-zinc-600">=</span>
          <div>
            <span className="text-[10px] text-emerald-400 block">Net Margin</span>
            <span className="text-emerald-300 font-black">+₹{logistics.netMargin.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FulfillmentDonut;
