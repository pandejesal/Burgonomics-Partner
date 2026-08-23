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

interface RevenueChartProps {
  data: DailyRevenue[];
}

export function RevenueChart({ data }: RevenueChartProps) {
  return (
    <div className="bg-surface rounded-2xl border border-border p-6 shadow-xs">
      <h3 className="font-semibold text-text-primary mb-4">Revenue Trend</h3>
      <div className="h-64">
        {data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-text-secondary text-sm">
            No revenue recorded for this period
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8B1A1A" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#8B1A1A" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" opacity={0.6} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: '#666666' }}
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
                tick={{ fontSize: 11, fill: '#666666' }}
                tickFormatter={(val) => `₹${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
              />
              <Tooltip
                formatter={(value: any) => [`₹${Number(value || 0).toLocaleString()}`, 'Revenue']}
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
                  backgroundColor: '#FFFFFF',
                  borderRadius: '12px',
                  border: '1px solid #E5E5E5',
                  fontSize: '12px',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                }}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="#8B1A1A"
                strokeWidth={2}
                fill="url(#colorRevenue)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
