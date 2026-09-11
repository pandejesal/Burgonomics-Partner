import React, { useState, useMemo } from 'react';
import { useCustomers } from '@/hooks/useCustomers';
import { useAdjustGrillCoins } from '@/hooks/useAdjustGrillCoins';
import { useAuthStore } from '@/stores/authStore';
import { exportToCsv } from '@/utils/exportCsv';
import {
  CustomerTable,
  GrillCoinsLedgerModal,
  type WalletAdjustmentPayload,
} from '@/features/customers';
import {
  Users,
  Download,
  Search,
  Coins,
  TrendingUp,
  ShoppingBag,
  Sparkles,
} from 'lucide-react';
import type { Customer } from '@/types';

export function CustomersPage() {
  const { user } = useAuthStore();
  // Loop 40/120: surface query failure loudly — an erroring directory must
  // never render as a confident empty list.
  const { data: rawCustomers = [], isLoading, isError, error } = useCustomers();

  const [searchQuery, setSearchQuery] = useState('');
  const [segmentFilter, setSegmentFilter] = useState<string>('all');
  const [adjustingCustomer, setAdjustingCustomer] = useState<Customer | null>(null);
  const adjustCoins = useAdjustGrillCoins();

  // Server is the source of truth: successful adjustments invalidate the
  // customers queries above, so fresh balances arrive without local fakes.
  const customers = useMemo(() => {
    return rawCustomers.map((c) => ({
      ...c,
      loyaltyPoints: c.loyaltyPoints || 0,
    }));
  }, [rawCustomers]);

  const filteredCustomers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return customers.filter((c) => {
      // 1. Segment filter
      if (segmentFilter !== 'all' && (c.segment || 'Regular') !== segmentFilter) {
        return false;
      }

      // 2. Instant Search by Phone Number, Name, Email, or Favorite Branch
      if (q) {
        const matchesName = (c.name || '').toLowerCase().includes(q);
        const matchesPhone = (c.phone || '').includes(q);
        const matchesEmail = (c.email || '').toLowerCase().includes(q);
        const matchesBranch = (c.favoriteBranchName || '').toLowerCase().includes(q);

        if (!matchesName && !matchesPhone && !matchesEmail && !matchesBranch) {
          return false;
        }
      }

      return true;
    });
  }, [customers, segmentFilter, searchQuery]);

  const totalLoyalty = customers.reduce((sum, c) => sum + (c.loyaltyPoints || 0), 0);
  const totalRevenue = customers.reduce((sum, c) => sum + (c.totalSpend || 0), 0);
  const vipCount = customers.filter((c) => c.segment === 'VIP').length;

  const handleExportCsv = () => {
    exportToCsv('Burgonomics_Customers_CRM', filteredCustomers, [
      { header: 'Customer ID', accessor: (c) => c.id },
      { header: 'Name', accessor: (c) => c.name },
      { header: 'Phone', accessor: (c) => c.phone },
      { header: 'Email', accessor: (c) => c.email || 'N/A' },
      { header: 'Segment', accessor: (c) => c.segment || 'Regular' },
      { header: 'Total Orders', accessor: (c) => c.totalOrders || 0 },
      { header: 'Total Spend (INR)', accessor: (c) => c.totalSpend || 0 },
      { header: 'Average Order Value (INR)', accessor: (c) => c.averageOrderValue || 0 },
      { header: 'Loyalty Points', accessor: (c) => c.loyaltyPoints || 0 },
      { header: 'Favorite Branch', accessor: (c) => c.favoriteBranchName || c.favoriteBranchId || 'N/A' },
      { header: 'Last Order Date', accessor: (c) => String(c.lastOrderDate || 'N/A') },
    ]);
  };

  // Throws on server failure — the modal then toasts the error instead of a
  // fake success. Balances refresh from the invalidated queries.
  const handleConfirmCoinAdjustment = async (payload: WalletAdjustmentPayload) => {
    await adjustCoins.mutateAsync(payload);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16 select-none">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white tracking-wide flex items-center gap-2.5">
            <span>Customer 360 & Loyalty CRM</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-950 border border-emerald-500/40 text-emerald-400 font-bold">
              RFM Analytics Live
            </span>
          </h1>
          <p className="text-xs text-neutral-400">
            {user?.role === 'branch_owner'
              ? 'Customer records & loyalty analytics scoped to your branch'
              : 'Enterprise-wide customer profiles, spend history, and loyalty records'}
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportCsv}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#0E4825] hover:bg-[#135d30] border border-emerald-500/40 text-emerald-300 rounded-xl font-bold text-xs transition-colors shadow-md cursor-pointer"
        >
          <Download className="w-4 h-4" />
          <span>Export CRM (.csv)</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#090909] border border-neutral-800 rounded-3xl p-4 space-y-1">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-xs font-bold uppercase">Total Profiles</span>
            <Users className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-black text-white">{customers.length}</p>
          <p className="text-[11px] text-neutral-500">Active dining customers</p>
        </div>

        <div className="bg-[#090909] border border-neutral-800 rounded-3xl p-4 space-y-1">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-xs font-bold uppercase">CRM Lifetime Value</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-black text-white">₹{totalRevenue.toLocaleString('en-IN')}</p>
          <p className="text-[11px] text-neutral-500">Aggregated customer spend</p>
        </div>

        <div className="bg-[#090909] border border-neutral-800 rounded-3xl p-4 space-y-1">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-xs font-bold uppercase">Grill Coins Issued</span>
            <Coins className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-black text-amber-400">{totalLoyalty.toLocaleString('en-IN')} 🪙</p>
          <p className="text-[11px] text-neutral-500">Circulating loyalty balance</p>
        </div>

        <div className="bg-[#090909] border border-neutral-800 rounded-3xl p-4 space-y-1">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-xs font-bold uppercase">VIP Customers</span>
            <Sparkles className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-black text-white">{vipCount}</p>
          <p className="text-[11px] text-neutral-500">High-frequency burger loyalists</p>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="p-4 rounded-3xl bg-neutral-900 border border-neutral-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-md">
        {/* Instant Phone / Name Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by 10-digit Phone, Name, or Email..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-neutral-950 border border-neutral-700 text-white placeholder-neutral-500 text-xs font-medium focus:outline-none focus:border-[#FF6600]"
          />
        </div>

        {/* Segment Filter Chips */}
        <div className="flex items-center gap-1 p-1 rounded-2xl bg-neutral-950 border border-neutral-800 overflow-x-auto">
          {['all', 'VIP', 'Regular', 'New'].map((seg) => (
            <button
              key={seg}
              type="button"
              onClick={() => setSegmentFilter(seg)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0 ${
                segmentFilter === seg
                  ? 'bg-[#0E4825] text-emerald-300 shadow-xs'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              {seg === 'all' ? 'All Segments' : seg}
            </button>
          ))}
        </div>
      </div>

      {/* Loop 40/120: query failure banner with recovery — never a silent
          empty list when the directory errors (e.g. role-denied reads). */}
      {isError && (
        <div className="p-4 rounded-3xl bg-red-950/40 border border-red-800 text-xs text-red-300 font-semibold">
          Couldn't load the customer directory
          {error instanceof Error && error.message ? `: ${error.message}` : "."} Check
          your connection and branch access, then reload.
        </div>
      )}

      {/* Customer CRM Table */}
      <CustomerTable
        customers={filteredCustomers}
        onOpenCoinsModal={setAdjustingCustomer}
      />

      {/* Grill Coins Adjustment Modal */}
      <GrillCoinsLedgerModal
        customer={adjustingCustomer}
        isOpen={!!adjustingCustomer}
        onClose={() => setAdjustingCustomer(null)}
        onConfirmAdjustment={handleConfirmCoinAdjustment}
      />
    </div>
  );
}

export default CustomersPage;
