import React from 'react';
import { Search, Plus } from 'lucide-react';
import type { OrderStatus, OrderType } from '@/types';

export type DateRangeFilter = 'today' | 'week' | 'month' | 'all';

interface OrderFiltersBarProps {
  channelFilter: OrderType | 'all';
  onChannelChange: (channel: OrderType | 'all') => void;
  statusFilter: OrderStatus | 'all';
  onStatusChange: (status: OrderStatus | 'all') => void;
  dateRange: DateRangeFilter;
  onDateRangeChange: (range: DateRangeFilter) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onOpenCreateModal: () => void;
  totalCount: number;
  filteredCount: number;
}

const CHANNELS: Array<{ id: OrderType | 'all'; label: string }> = [
  { id: 'all', label: 'All channels' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'takeaway', label: 'Takeaway' },
  { id: 'dinein', label: 'Dine-in' },
];

const STATUSES: Array<{ id: OrderStatus | 'all'; label: string }> = [
  { id: 'all', label: 'All statuses' },
  { id: 'pending', label: 'Pending' },
  { id: 'accepted', label: 'Accepted' },
  { id: 'preparing', label: 'Preparing' },
  { id: 'ready', label: 'Ready' },
  { id: 'out_for_delivery', label: 'Out for delivery' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'quarantine', label: 'Needs review' },
];

const RANGES: Array<{ id: DateRangeFilter; label: string }> = [
  { id: 'all', label: 'All time' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
];

/**
 * OrderFiltersBar — presentational filter + search shell. All filter state
 * lives in the page (lifted); this component only renders controls and
 * forwards changes. Counts are display-only.
 */
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
}: OrderFiltersBarProps) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 space-y-3">
      <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search order #, customer, phone, branch..."
            aria-label="Search orders"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-neutral-950 border border-neutral-700 text-white placeholder-neutral-500 text-xs font-medium focus:outline-none focus:border-[#FF6600]"
          />
        </div>
        <button
          type="button"
          onClick={onOpenCreateModal}
          className="flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] bg-[#FF6600] hover:bg-[#e05a00] text-white rounded-xl font-bold text-xs transition-colors cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>New Walk-in Order</span>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {CHANNELS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onChannelChange(c.id)}
            aria-pressed={channelFilter === c.id}
            className={`px-3 py-1.5 min-h-[44px] rounded-xl text-xs font-bold transition-colors cursor-pointer ${
              channelFilter === c.id
                ? 'bg-[#0E4825] text-emerald-300 border border-emerald-500/40'
                : 'bg-neutral-950 text-neutral-400 border border-neutral-800 hover:text-white'
            }`}
          >
            {c.label}
          </button>
        ))}
        <span className="w-px h-6 bg-neutral-800 mx-1" aria-hidden="true" />
        {RANGES.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => onDateRangeChange(r.id)}
            aria-pressed={dateRange === r.id}
            className={`px-3 py-1.5 min-h-[44px] rounded-xl text-xs font-bold transition-colors cursor-pointer ${
              dateRange === r.id
                ? 'bg-[#0E4825] text-emerald-300 border border-emerald-500/40'
                : 'bg-neutral-950 text-neutral-400 border border-neutral-800 hover:text-white'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
          Status
          <select
            value={statusFilter}
            onChange={(e) => onStatusChange(e.target.value as OrderStatus | 'all')}
            className="ml-2 px-3 py-2 min-h-[44px] rounded-xl bg-neutral-950 border border-neutral-700 text-white text-xs font-bold focus:outline-none focus:border-[#FF6600] cursor-pointer"
          >
            {STATUSES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <p className="text-[11px] text-neutral-500 font-mono ml-auto">
          Showing {filteredCount} of {totalCount}
        </p>
      </div>
    </div>
  );
}

export default OrderFiltersBar;
