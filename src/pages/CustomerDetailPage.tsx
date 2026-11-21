import React, { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCustomer } from '@/hooks/useCustomer';
import { CustomerOrderHistoryCard } from '@/features/customers';
import { ArrowLeft, Phone, ShoppingBag } from 'lucide-react';

/**
 * Customer 360 profile.
 *
 * Loyalty is NOT part of the launch (owner decision 2026-11-20: "Loyalty no:
 * hide coins, tiers and points everywhere"). The "Grill Coins Balance" KPI and
 * the "Adjust Grill Coins" action/modal are gone, and the server stopped
 * minting in the same change. What stays is the commercial profile a branch
 * actually works with: contact details, addresses and the order stream.
 */
export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: customer, isLoading } = useCustomer(id || '');

  // Scoped orders come from useCustomer (customerId == id, server-filtered).
  // The old code re-downloaded the ENTIRE orders collection via useOrders()
  // just to fuzzy-match by phone/name here. Guest/alias orders whose
  // customerId differs stay reachable through the order search, not a 5k-doc
  // scan per profile open. (Above early returns — hooks order must be stable.)
  const customerOrders = useMemo(() => customer?.orders ?? [], [customer]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-20 text-neutral-400">
        <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="text-center py-20 space-y-3">
        <h2 className="text-lg font-bold text-white">Customer Record Not Found</h2>
        <button
          type="button"
          onClick={() => navigate('/customers')}
          className="px-4 py-2 rounded-xl bg-neutral-900 text-neutral-300 font-bold text-xs"
        >
          ← Back to CRM
        </button>
      </div>
    );
  }

  const totalSpend = customer.totalSpend || customerOrders.reduce((sum, o) => sum + (o.total || 0), 0);
  const totalOrdersCount = customer.totalOrders || customerOrders.length;
  const aov =
    customer.averageOrderValue ||
    (totalOrdersCount > 0 ? Math.round(totalSpend / totalOrdersCount) : 0);

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16 select-none">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/customers')}
            className="p-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 rounded-xl text-neutral-300 hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-black text-white flex items-center gap-2">
              <span>{customer.name}</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-950 border border-amber-500/40 text-amber-300 font-bold">
                {customer.segment || 'Regular'}
              </span>
            </h1>
            <p className="text-xs text-neutral-400">Customer 360 profile & transaction history</p>
          </div>
        </div>
      </div>

      {/* Customer 360 KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-3xl bg-[#090909] border border-neutral-800 space-y-1">
          <span className="text-[10px] font-bold text-neutral-400 uppercase block">Lifetime Spend</span>
          <p className="font-mono text-xl font-black text-emerald-400">₹{totalSpend.toLocaleString('en-IN')}</p>
          <span className="text-[10px] text-neutral-500">Gross revenue</span>
        </div>

        <div className="p-4 rounded-3xl bg-[#090909] border border-neutral-800 space-y-1">
          <span className="text-[10px] font-bold text-neutral-400 uppercase block">Total Orders</span>
          <p className="font-mono text-xl font-black text-white">{totalOrdersCount}</p>
          <span className="text-[10px] text-neutral-500">Lifetime orders placed</span>
        </div>

        <div className="p-4 rounded-3xl bg-[#090909] border border-neutral-800 space-y-1">
          <span className="text-[10px] font-bold text-neutral-400 uppercase block">Avg Order Value (AOV)</span>
          <p className="font-mono text-xl font-black text-white">₹{aov.toLocaleString('en-IN')}</p>
          <span className="text-[10px] text-neutral-500">Spend per order</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Contact & Addresses */}
        <div className="space-y-4">
          <div className="p-5 rounded-3xl bg-[#090909] border border-neutral-800 space-y-4">
            <h2 className="text-sm font-black text-white uppercase tracking-wider border-b border-neutral-800 pb-3">
              Customer Contact Info
            </h2>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-neutral-400">Phone:</span>
                <a
                  href={`tel:${customer.phone}`}
                  className="font-mono font-bold text-emerald-400 hover:underline flex items-center gap-1"
                >
                  <Phone className="w-3 h-3" />
                  <span>{customer.phone}</span>
                </a>
              </div>

              {customer.email && (
                <div className="flex items-center justify-between">
                  <span className="text-neutral-400">Email:</span>
                  <span className="font-medium text-white truncate max-w-[180px]">{customer.email}</span>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-neutral-400">Favorite Branch:</span>
                <span className="font-bold text-white">
                  {customer.favoriteBranchName || customer.favoriteBranchId || 'No favourite branch yet'}
                </span>
              </div>
            </div>
          </div>

          {/* Registered Delivery Addresses */}
          {customer.addresses && customer.addresses.length > 0 && (
            <div className="p-5 rounded-3xl bg-[#090909] border border-neutral-800 space-y-3">
              <h2 className="text-sm font-black text-white uppercase tracking-wider border-b border-neutral-800 pb-3">
                Saved Delivery Addresses
              </h2>

              <div className="space-y-2 text-xs">
                {customer.addresses.map((addr, idx) => (
                  <div key={idx} className="p-3 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-1">
                    <span className="font-bold text-white block">{addr.label || `Address #${idx + 1}`}</span>
                    <p className="text-neutral-400 text-[11px] leading-relaxed">{addr.full || (addr as any).street || ''}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Order History Stream */}
        <div className="lg:col-span-2 space-y-4">
          <div className="p-5 rounded-3xl bg-[#090909] border border-neutral-800 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-emerald-400" />
                <span>Customer Order Stream ({customerOrders.length})</span>
              </h2>
            </div>

            {customerOrders.length === 0 ? (
              <div className="text-center py-10 text-neutral-500 text-xs">
                No orders found for this customer profile.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {customerOrders.map((order) => (
                  <CustomerOrderHistoryCard key={order.id} order={order} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default CustomerDetailPage;
