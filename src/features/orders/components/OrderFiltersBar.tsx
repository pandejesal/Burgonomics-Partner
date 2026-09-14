import React from 'react';
import {
  Search,
  Bike,
  ShoppingBag,
  UtensilsCrossed,
  Plus,
  Calendar,
  X,
  Filter,
} from 'lucide-react';
import type { OrderStatus, OrderType } from '@/types';

interface OrderFiltersBarProps {
  channelFilter: OrderType | 'all';
  onChannelChange: (channel: OrderType | 'all') => void;
  statusFilter: OrderStatus | 'all';
  onStatusChange: (status: OrderStatus | 'all') => void;
  dateRange: 'today' | 'week' | 'month' | 'all';
  onDateRangeChange: (range: 'today' | 'week' | 'month' | 'all') => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onOpenCreateModal: () => void;
  totalCount: number;
  filteredCount: number;
  className?: string;
}

const STATUS_CHIPS: Array<{ key: OrderStatus | 'all'; label: string }> = [
  { key: 'all', label: 'All Status' },
  { key: 'pending', label: 'New (Placed)' },
  { key: 'preparing', label: 'In Kitchen' },
  { key: 'ready', label: 'Ready' },
  { key: 'out_for_delivery', label: 'Dispatched' },
  { key: 'delivered', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

export function OrderFiltersBar({
  channelFilter,
  onChannelChange,
  statusFilter,
  onStatusChange,
  dateRange,
  onDateRangeChange,
  searchQuery,
  onSearchChange,
  onOpenCreateModal,
  totalCount,
  filteredCount,
  className = '',
}: OrderFiltersBarProps) {
  return (
    <div className={`space-y-3.5 bg-neutral-900/90 border border-neutral-800 p-4 rounded-2xl shadow-sm ${className}`}>
      {/* Row 1: Search bar, Date Range, and + New Walk-in Order CTA */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Instant Search Bar */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by Order #, Customer Name, or Phone..."
            className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-neutral-950 border border-neutral-700 text-white placeholder-neutral-500 text-xs sm:text-sm font-medium focus:outline-none focus:border-[#FF6600] transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2.5 overflow-x-auto">
          {/* Date Range Selector */}
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-700 text-xs font-bold text-neutral-300">
            <Calendar className="w-3.5 h-3.5 text-neutral-400" />
            <select
              value={dateRange}
              onChange={(e) => onDateRangeChange(e.target.value as any)}
              className="bg-transparent text-white text-xs font-bold focus:outline-none cursor-pointer"
            >
              <option value="today" className="bg-neutral-900 text-white">Today</option>
              <option value="week" className="bg-neutral-900 text-white">This Week</option>
              <option value="month" className="bg-neutral-900 text-white">This Month</option>
              <option value="all" className="bg-neutral-900 text-white">All Time</option>
            </select>
          </div>

          {/* + New Walk-in Order Modal Trigger */}
          <button
            type="button"
            onClick={onOpenCreateModal}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#FF6600] hover:bg-[#e05a00] text-white font-black text-xs uppercase tracking-wider shadow-md transition-all active:scale-[0.98] cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>+ Walk-in Order</span>
          </button>
        </div>
      </div>

      {/* Row 2: Channel Filter Tabs & Status Chips */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 border-t border-neutral-800/80 pt-3">
        {/* Fulfillment Channel Tabs */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-neutral-950 border border-neutral-800 overflow-x-auto max-w-full">
          <button
            type="button"
            onClick={() => onChannelChange('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0 ${
              channelFilter === 'all'
                ? 'bg-[#0E4825] text-emerald-300 shadow-xs'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            All Channels ({totalCount})
          </button>

          <button
            type="button"
            onClick={() => onChannelChange('delivery')}
            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0 ${
              channelFilter === 'delivery'
                ? 'bg-orange-600 text-white shadow-xs'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Bike className="w-3.5 h-3.5" />
            <span>Delivery</span>
          </button>

          <button
            type="button"
            onClick={() => onChannelChange('takeaway')}
            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0 ${
              channelFilter === 'takeaway'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Takeaway</span>
          </button>

          <button
            type="button"
            onClick={() => onChannelChange('dinein')}
            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0 ${
              channelFilter === 'dinein'
                ? 'bg-cyan-700 text-white shadow-xs'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <UtensilsCrossed className="w-3.5 h-3.5" />
            <span>Dine-In</span>
          </button>
        </div>

        {/* Status Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-1 lg:pb-0">
          {STATUS_CHIPS.map((chip) => {
            const isActive = statusFilter === chip.key;
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => onStatusChange(chip.key)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer shrink-0 ${
                  isActive
                    ? 'bg-neutral-200 text-black border-white'
                    : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-700'
                }`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default OrderFiltersBar;
