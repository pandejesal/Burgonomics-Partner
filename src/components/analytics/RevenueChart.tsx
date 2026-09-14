import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import type { DailyRevenue } from '@/hooks/useAnalytics';
import { TrendingUp, DollarSign } from 'lucide-react';

interface RevenueChartProps {
  data: DailyRevenue[];
}

export function RevenueChart({ data }: RevenueChartProps) {
  return (
    <div className="bg-surface rounded-2xl border border-border p-6 shadow-xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-surface-hover text-accent-light border border-border">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-white text-base tracking-wide">Revenue & Sales Trend</h3>
            <p className="text-xs text-zinc-400">Gross sales volume over time across all fulfillment channels</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-bg border border-border text-xs font-mono text-accent-light font-bold">
          <span className="w-2 h-2 rounded-full bg-accent animate-pulse"></span>
          <span>INR (₹)</span>
        </div>
      </div>

      <div className="h-72">
        {data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-zinc-500 text-xs">
            No revenue recorded for this timeframe
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
              <defs>
                <linearGradient id="colorRevenueBurgonomics" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#D95D0F" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#D95D0F" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#234B2A" opacity={0.6} />
              <XAxis
                dataKey="date"
                stroke="#6B7280"
                tick={{ fontSize: 11, fill: '#9CA3AF' }}
                tickFormatter={(value) => {
                  try {
                    const date = new Date(value);
                    return date.toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                    });
                  } catch {
                    return value;
                  }
                }}
              />
              <YAxis
                stroke="#6B7280"
                tick={{ fontSize: 11, fill: '#9CA3AF' }}
                tickFormatter={(val) => `₹${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
              />
              <Tooltip
                formatter={(value: any) => [`₹${Number(value || 0).toLocaleString()}`, 'Gross Sales']}
                labelFormatter={(label: any) => {
                  try {
                    return new Date(String(label)).toLocaleDateString('en-IN', {
                      weekday: 'short',
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    });
                  } catch {
                    return String(label);
                  }
                }}
                contentStyle={{
                  backgroundColor: '#0D0F0D',
                  borderRadius: '12px',
                  border: '1px solid #234B2A',
                  fontSize: '12px',
                  color: '#FFFFFF',
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.7)',
                }}
                itemStyle={{ color: '#D95D0F', fontWeight: 'bold' }}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="#D95D0F"
                strokeWidth={3}
                fill="url(#colorRevenueBurgonomics)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export default RevenueChart;
