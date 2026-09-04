import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCustomers } from '@/hooks/useCustomers';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import { exportToCsv } from '@/utils/exportCsv';
import {
  Users,
  Download,
  Search,
  Award,
  TrendingUp,
  ShoppingBag,
  Store,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import type { Customer } from '@/types';

export function CustomersPage() {
  const { user } = useAuthStore();
  const { selectedCity, selectedBranchId } = useAppStore();
  const { data: customers = [], isLoading } = useCustomers();
  const [searchQuery, setSearchQuery] = useState('');
  const [segmentFilter, setSegmentFilter] = useState<string>('all');

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
      { header: 'City', accessor: (c) => c.favoriteCity || 'N/A' },
      { header: 'Last Order Date', accessor: (c) => String(c.lastOrderDate || 'N/A') },
    ]);
  };

  const filteredCustomers = customers.filter((c) => {
    const matchesSegment = segmentFilter === 'all' || c.segment === segmentFilter;
    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery) ||
      (c.email && c.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (c.favoriteBranchName && c.favoriteBranchName.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesSegment && matchesSearch;
  });

  const totalLoyalty = customers.reduce((sum, c) => sum + (c.loyaltyPoints || 0), 0);
  const totalRevenue = customers.reduce((sum, c) => sum + (c.totalSpend || 0), 0);
  const vipCount = customers.filter((c) => c.segment === 'VIP').length;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-wide">
            Customer CRM & Loyalty Hub
          </h1>
          <p className="text-xs text-zinc-400">
            {user?.role === 'branch_owner'
              ? 'Customer records & loyalty analytics scoped to your branch'
              : 'Enterprise-wide customer profiles, spend history, and loyalty records'}
          </p>
        </div>

        <button
          onClick={handleExportCsv}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#D95D0F] hover:bg-[#b84d0b] text-white rounded-xl font-semibold text-xs transition-colors shadow-md cursor-pointer"
        >
          <Download className="w-4 h-4" />
          <span>Export CRM (.csv)</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#132A17] border border-[#234B2A] rounded-2xl p-4 space-y-1">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-semibold">Total CRM Profiles</span>
            <Users className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-black text-white">{customers.length}</p>
          <p className="text-[11px] text-zinc-400">Active dining customers</p>
        </div>

        <div className="bg-[#132A17] border border-[#234B2A] rounded-2xl p-4 space-y-1">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-semibold">CRM Total Spend</span>
            <TrendingUp className="w-4 h-4 text-[#D95D0F]" />
          </div>
          <p className="text-2xl font-black text-white">₹{totalRevenue.toLocaleString()}</p>
          <p className="text-[11px] text-zinc-400">Aggregated customer lifetime value</p>
        </div>

        <div className="bg-[#132A17] border border-[#234B2A] rounded-2xl p-4 space-y-1">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-semibold">Loyalty Points Bank</span>
            <Award className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-black text-white">{totalLoyalty.toLocaleString()}</p>
          <p className="text-[11px] text-zinc-400">Global brand points balance</p>
        </div>

        <div className="bg-[#132A17] border border-[#234B2A] rounded-2xl p-4 space-y-1">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-semibold">VIP Segment</span>
            <Sparkles className="w-4 h-4 text-purple-400" />
          </div>
          <p className="text-2xl font-black text-white">{vipCount}</p>
          <p className="text-[11px] text-zinc-400">High-frequency patrons</p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-[#132A17] p-4 rounded-xl border border-[#234B2A] flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {(['all', 'VIP', 'Regular', 'New', 'At-Risk'] as const).map((seg) => (
            <button
              key={seg}
              onClick={() => setSegmentFilter(seg)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                segmentFilter === seg
                  ? 'bg-[#D95D0F] text-white'
                  : 'bg-[#0D0F0D] text-zinc-400 hover:text-white border border-[#234B2A]'
              }`}
            >
              {seg === 'all' ? 'All Segments' : seg}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search customer name, phone, branch..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-[#0D0F0D] border border-[#234B2A] rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-[#D95D0F]"
          />
        </div>
      </div>

      {/* CRM Table */}
      {isLoading ? (
        <div className="p-16 text-center text-zinc-400 text-xs">Loading CRM records...</div>
      ) : filteredCustomers.length === 0 ? (
        <div className="text-center py-16 bg-[#132A17] rounded-2xl border border-[#234B2A] p-8 space-y-3">
          <Users className="w-12 h-12 mx-auto text-zinc-600" />
          <h3 className="font-semibold text-white text-sm">No customer records found</h3>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto">
            Customers will automatically be indexed in CRM upon placing orders.
          </p>
        </div>
      ) : (
        <div className="bg-[#132A17] border border-[#234B2A] rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0E1E12] border-b border-[#234B2A] text-zinc-400 font-semibold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-5 py-3.5">Customer</th>
                  <th className="px-5 py-3.5">Segment</th>
                  <th className="px-5 py-3.5">Orders & Spend</th>
                  <th className="px-5 py-3.5">Loyalty Points</th>
                  <th className="px-5 py-3.5">Favorite Outlet</th>
                  <th className="px-5 py-3.5">Last Active</th>
                  <th className="px-5 py-3.5 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1A3320] text-zinc-200">
                {filteredCustomers.map((customer) => (
                  <tr
                    key={customer.id}
                    className="hover:bg-[#16301B] transition-colors group cursor-pointer"
                  >
                    <td className="px-5 py-4">
                      <div className="font-bold text-white text-sm">{customer.name}</div>
                      <div className="text-[11px] text-zinc-400 font-mono">{customer.phone}</div>
                      {customer.email && (
                        <div className="text-[10px] text-zinc-500">{customer.email}</div>
                      )}
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                          customer.segment === 'VIP'
                            ? 'bg-purple-950/80 text-purple-300 border border-purple-800/60'
                            : customer.segment === 'New'
                            ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                            : customer.segment === 'At-Risk'
                            ? 'bg-rose-950/80 text-rose-300 border border-rose-800/60'
                            : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                        }`}
                      >
                        {customer.segment || 'Regular'}
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      <div className="font-bold text-white">
                        ₹{(customer.totalSpend || 0).toLocaleString()}
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        {customer.totalOrders || 1} orders (AOV: ₹
                        {customer.averageOrderValue || 250})
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex items-center space-x-1 text-amber-400 font-bold">
                        <Award className="w-3.5 h-3.5" />
                        <span>{customer.loyaltyPoints} pts</span>
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex items-center space-x-1.5 text-zinc-300 font-medium">
                        <Store className="w-3.5 h-3.5 text-[#D95D0F]" />
                        <span>{customer.favoriteBranchName || customer.favoriteCity || 'Surat Adajan'}</span>
                      </div>
                    </td>

                    <td className="px-5 py-4 text-zinc-400 text-[11px]">
                      {String(customer.lastOrderDate || 'Recently')}
                    </td>

                    <td className="px-5 py-4 text-right">
                      <Link
                        to={`/customers/${customer.id}`}
                        className="inline-flex items-center p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-[#1E3A24] transition-colors"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
