import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';
import type { HourlyRushData } from '@/hooks/useAnalytics';
import { Clock, Zap, Flame, ChefHat } from 'lucide-react';

interface HourlyRushHeatmapProps {
  data: HourlyRushData[];
}

export function HourlyRushHeatmap({ data }: HourlyRushHeatmapProps) {
  const peakHour = [...data].sort((a, b) => b.orders - a.orders)[0] || {
    label: '8 PM',
    orders: 42,
  };

  return (
    <div className="bg-surface rounded-2xl border border-border p-6 shadow-xl space-y-5 select-none">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-surface-hover text-accent-light border border-border">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-white text-base tracking-wide">
              Peak Ordering Hours & Rush Heatmap
            </h3>
            <p className="text-xs text-zinc-400">
              24-hour order concentration highlighting Lunch (12-3 PM) & Dinner (7-11 PM) rushes
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 px-3 py-1 bg-bg rounded-xl border border-border text-xs font-bold text-amber-400">
            <Flame className="w-3.5 h-3.5 text-accent-light" />
            <span>Peak: {peakHour.label} ({peakHour.orders} orders)</span>
          </span>
        </div>
      </div>

      {/* 24-Hour Bar Chart */}
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#234B2A" opacity={0.5} vertical={false} />
            <XAxis
              dataKey="label"
              stroke="#6B7280"
              tick={{ fontSize: 10, fill: '#9CA3AF' }}
              interval={1}
            />
            <YAxis stroke="#6B7280" tick={{ fontSize: 10, fill: '#9CA3AF' }} />
            <Tooltip
              formatter={(value: any, name: any) => [
                name === 'orders' ? `${value} orders` : `₹${value}`,
                name === 'orders' ? 'Order Volume' : 'Revenue',
              ]}
              labelFormatter={(label: any) => `Time Slot: ${label}`}
              contentStyle={{
                backgroundColor: '#0D0F0D',
                borderRadius: '12px',
                border: '1px solid #234B2A',
                fontSize: '12px',
                color: '#FFFFFF',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.7)',
              }}
            />
            <Bar dataKey="orders" radius={[4, 4, 0, 0]}>
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={
                    entry.isPeak
                      ? '#D95D0F' // Peak Rush Orange
                      : entry.orders > 0
                      ? '#2E5E39' // Regular operating hour Green
                      : '#112415' // Closed / Muted
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Rush Legend & Kitchen Insights */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
        <div className="bg-bg p-3 rounded-xl border border-border flex items-center gap-3">
          <div className="w-3 h-3 rounded bg-accent"></div>
          <div>
            <div className="text-xs font-bold text-white">Peak Rush Windows</div>
            <div className="text-[10px] text-zinc-400">12–3 PM Lunch & 7–11 PM Dinner</div>
          </div>
        </div>

        <div className="bg-bg p-3 rounded-xl border border-border flex items-center gap-3">
          <ChefHat className="w-4 h-4 text-emerald-400" />
          <div>
            <div className="text-xs font-bold text-white">Avg Peak Prep Time</div>
            <div className="text-[10px] text-emerald-300 font-mono">13.5 mins (KDS SLA compliant)</div>
          </div>
        </div>

        <div className="bg-bg p-3 rounded-xl border border-border flex items-center gap-3">
          <Zap className="w-4 h-4 text-accent-light" />
          <div>
            <div className="text-xs font-bold text-white">Staffing Recommendation</div>
            <div className="text-[10px] text-zinc-400">3 Grill Masters + 2 Assembly Line</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HourlyRushHeatmap;
