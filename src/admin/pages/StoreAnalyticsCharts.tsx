import React from "react";
import { TrendingUp } from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as ChartTooltip,
} from "recharts";

export interface StoreAnalyticsChartsProps {
  avgOrderValue: number | string;
  peakHour: string;
  weeklyRevenueTrend: number[];
}

const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Below-the-fold outlet analytics, code-split so the stores page shell
// (list/grid/radar + settings) loads without pulling in recharts upfront.
export const StoreAnalyticsCharts: React.FC<StoreAnalyticsChartsProps> = ({
  avgOrderValue,
  peakHour,
  weeklyRevenueTrend,
}) => {
  return (
    <div className="rounded-[20px] border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1C1C1E]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider">
          Outlet Sales & Traffic Analytics
        </h3>
        <TrendingUp size={16} className="text-primary" />
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4 text-xs font-semibold">
        <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-900/40">
          <span className="block text-gray-400">AOV (Average Basket):</span>
          <span className="font-mono text-sm font-black text-gray-900 dark:text-white">
            ₹{avgOrderValue}
          </span>
        </div>
        <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-900/40">
          <span className="block text-gray-400">Peak Ordering Hour:</span>
          <span className="font-mono text-sm font-black text-gray-900 dark:text-white truncate">
            {peakHour}
          </span>
        </div>
      </div>

      {/* Weekly Sales Chart */}
      <div className="h-44 w-full">
        <span className="block text-[10px] font-black text-gray-400 uppercase mb-2">
          Weekly Revenue Trend (INR)
        </span>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={weeklyRevenueTrend.map((val, idx) => ({
              day: WEEK_DAYS[idx],
              revenue: val,
            }))}
            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
          >
            <defs>
              <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0E4825" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#0E4825" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="day" stroke="#94a3b8" fontSize={9} />
            <YAxis stroke="#94a3b8" fontSize={9} />
            <ChartTooltip />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="#0E4825"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#revenueGrad)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default StoreAnalyticsCharts;
