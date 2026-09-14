import React from 'react';
import {
  TrendingUp,
  ShoppingBag,
  Flame,
  Bike,
  Coins,
  Receipt,
  Users,
} from 'lucide-react';

export interface DashboardMetrics {
  todayRevenue: number;
  todayOrdersCount: number;
  activeKitchenCount: number;
  inTransitCount: number;
  averageOrderValue: number;
  totalCustomersCount?: number;
}

interface LiveStatsGridProps {
  metrics: DashboardMetrics;
}

export function LiveStatsGrid({ metrics }: LiveStatsGridProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 select-none">
      {/* 1. Today's Revenue */}
      <div className="p-4 rounded-3xl bg-[#090909] border border-neutral-800 space-y-1 hover:border-emerald-500/40 transition-colors shadow-md">
        <div className="flex items-center justify-between text-neutral-400">
          <span className="text-[10px] font-bold uppercase tracking-wider">Today's Revenue</span>
          <TrendingUp className="w-4 h-4 text-emerald-400" />
        </div>
        <p className="font-mono text-2xl font-black text-[#4ADE80]">
          ₹{metrics.todayRevenue.toLocaleString('en-IN')}
        </p>
        <span className="text-[10px] text-neutral-500">Paid orders gross</span>
      </div>

      {/* 2. Total Orders Today */}
      <div className="p-4 rounded-3xl bg-[#090909] border border-neutral-800 space-y-1 hover:border-neutral-700 transition-colors shadow-md">
        <div className="flex items-center justify-between text-neutral-400">
          <span className="text-[10px] font-bold uppercase tracking-wider">Orders Today</span>
          <ShoppingBag className="w-4 h-4 text-white" />
        </div>
        <p className="font-mono text-2xl font-black text-white">
          {metrics.todayOrdersCount}
        </p>
        <span className="text-[10px] text-neutral-500">Counter + Delivery</span>
      </div>

      {/* 3. Kitchen Active (In-Prep) */}
      <div className="p-4 rounded-3xl bg-[#090909] border border-neutral-800 space-y-1 hover:border-[#FF6600]/40 transition-colors shadow-md">
        <div className="flex items-center justify-between text-neutral-400">
          <span className="text-[10px] font-bold uppercase tracking-wider">Grilling in KDS</span>
          <Flame className="w-4 h-4 text-[#FF6600]" />
        </div>
        <p className="font-mono text-2xl font-black text-[#FF6600]">
          {metrics.activeKitchenCount}
        </p>
        <span className="text-[10px] text-neutral-500">Active live KOTs</span>
      </div>

      {/* 4. In-Transit / Dispatched */}
      <div className="p-4 rounded-3xl bg-[#090909] border border-neutral-800 space-y-1 hover:border-cyan-500/40 transition-colors shadow-md">
        <div className="flex items-center justify-between text-neutral-400">
          <span className="text-[10px] font-bold uppercase tracking-wider">Out with Rider</span>
          <Bike className="w-4 h-4 text-cyan-400" />
        </div>
        <p className="font-mono text-2xl font-black text-cyan-400">
          {metrics.inTransitCount}
        </p>
        <span className="text-[10px] text-neutral-500">Porter + In-house</span>
      </div>

      {/* 5. Average Order Value */}
      <div className="p-4 rounded-3xl bg-[#090909] border border-neutral-800 space-y-1 hover:border-neutral-700 transition-colors shadow-md col-span-2 sm:col-span-1">
        <div className="flex items-center justify-between text-neutral-400">
          <span className="text-[10px] font-bold uppercase tracking-wider">Avg Order Value</span>
          <Receipt className="w-4 h-4 text-neutral-400" />
        </div>
        <p className="font-mono text-2xl font-black text-white">
          ₹{metrics.averageOrderValue.toLocaleString('en-IN')}
        </p>
        <span className="text-[10px] text-neutral-500">Average ticket size</span>
      </div>
    </div>
  );
}

export default LiveStatsGrid;
