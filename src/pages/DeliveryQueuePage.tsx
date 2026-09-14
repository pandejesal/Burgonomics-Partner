import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  PorterDispatchCard,
  RiderAssignmentModal,
  usePorterLogistics,
} from '@/features/delivery';
import {
  Bike,
  Search,
  Zap,
  Clock,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  RotateCcw,
  SlidersHorizontal,
  ChevronRight,
} from 'lucide-react';
import type { Order } from '@/types';

export function DeliveryQueuePage() {
  const {
    deliveryOrders,
    isLoading,
    quotes,
    loadingQuotes,
    dispatchingOrderIds,
    fetchOrderQuote,
    dispatchPorter,
    assignInHouseRider,
    cancelPorter,
  } = usePorterLogistics();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'ready' | 'in_transit' | 'unassigned'>('all');
  const [assigningOrder, setAssigningOrder] = useState<Order | null>(null);

  // Filtered orders list
  const filteredOrders = useMemo(() => {
    return deliveryOrders.filter((order) => {
      // 1. Tab filter
      const isDispatched = order.status === 'out_for_delivery' || !!order.riderName;
      if (filterTab === 'ready' && order.status !== 'ready') return false;
      if (filterTab === 'in_transit' && !isDispatched) return false;
      if (filterTab === 'unassigned' && isDispatched) return false;

      // 2. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const shortCode =
          (order as any).shortCode ||
          (order as any).orderNumber ||
          order.id.slice(-6);

        const matchesCode = shortCode.toLowerCase().includes(q) || order.id.toLowerCase().includes(q);
        const matchesCustomer = (order.customerName || '').toLowerCase().includes(q);
        const matchesPhone = (order.customerPhone || '').includes(q);
        const matchesRider = (order.riderName || '').toLowerCase().includes(q);

        if (!matchesCode && !matchesCustomer && !matchesPhone && !matchesRider) {
          return false;
        }
      }

      return true;
    });
  }, [deliveryOrders, filterTab, searchQuery]);

  // Statistics
  const readyCount = deliveryOrders.filter((o) => o.status === 'ready').length;
  const inTransitCount = deliveryOrders.filter(
    (o) => o.status === 'out_for_delivery' || !!o.riderName
  ).length;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16 select-none">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white tracking-wide flex items-center gap-2.5">
            <span>Delivery Queue & Porter Logistics</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-orange-950 border border-orange-500/40 text-orange-400 font-bold">
              3PL Dispatch Live
            </span>
          </h1>
          <p className="text-xs text-neutral-400">
            Automated Porter 2-wheeler courier allocation, live fare quotes, and in-house fleet assignment
          </p>
        </div>

        <Link
          to="/orders"
          className="flex items-center gap-1.5 px-4 py-2.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-white rounded-xl font-bold text-xs transition-colors"
        >
          <span>All Orders Stream</span>
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-3xl bg-neutral-900 border border-neutral-800 flex items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-amber-950/60 border border-amber-800/60 text-amber-400">
            <Clock className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <span className="text-xs font-bold text-neutral-400 block uppercase">Ready for Dispatch</span>
            <span className="font-mono text-2xl font-black text-amber-400">{readyCount} Orders</span>
          </div>
        </div>

        <div className="p-4 rounded-3xl bg-neutral-900 border border-neutral-800 flex items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-cyan-950/60 border border-cyan-800/60 text-cyan-400">
            <Bike className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-bold text-neutral-400 block uppercase">Out for Delivery</span>
            <span className="font-mono text-2xl font-black text-cyan-400">{inTransitCount} Couriers</span>
          </div>
        </div>

        <div className="p-4 rounded-3xl bg-neutral-900 border border-neutral-800 flex items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-[#0E4825] border border-emerald-500/40 text-emerald-300">
            <Zap className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-bold text-neutral-400 block uppercase">Porter API Status</span>
            <span className="font-mono text-base font-black text-emerald-400">Connected ✓ (Instant)</span>
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="p-4 rounded-3xl bg-neutral-900 border border-neutral-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-md">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Order #, Customer, or Rider..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-neutral-950 border border-neutral-700 text-white placeholder-neutral-500 text-xs font-medium focus:outline-none focus:border-[#FF6600]"
          />
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 p-1 rounded-2xl bg-neutral-950 border border-neutral-800 overflow-x-auto">
          <button
            type="button"
            onClick={() => setFilterTab('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0 ${
              filterTab === 'all'
                ? 'bg-[#0E4825] text-emerald-300 shadow-xs'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            All Active ({deliveryOrders.length})
          </button>

          <button
            type="button"
            onClick={() => setFilterTab('ready')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0 ${
              filterTab === 'ready'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Ready ({readyCount})
          </button>

          <button
            type="button"
            onClick={() => setFilterTab('in_transit')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0 ${
              filterTab === 'in_transit'
                ? 'bg-cyan-700 text-white shadow-xs'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            In-Transit ({inTransitCount})
          </button>

          <button
            type="button"
            onClick={() => setFilterTab('unassigned')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0 ${
              filterTab === 'unassigned'
                ? 'bg-rose-700 text-white shadow-xs'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Unassigned
          </button>
        </div>
      </div>

      {/* Orders Grid */}
      {isLoading ? (
        <div className="flex justify-center py-20 text-neutral-400">
          <Clock className="w-8 h-8 animate-spin mb-2" />
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="text-center py-16 bg-neutral-900/40 rounded-3xl border border-dashed border-neutral-800 p-8">
          <Bike className="w-12 h-12 mx-auto text-neutral-600 mb-3" />
          <h3 className="font-bold text-white text-base">No Delivery Orders In Queue</h3>
          <p className="text-xs text-neutral-500 mt-1">
            All packed delivery orders have been allocated couriers or completed.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredOrders.map((order) => (
            <PorterDispatchCard
              key={order.id}
              order={order}
              quote={quotes[order.id]}
              loadingQuote={loadingQuotes[order.id]}
              isDispatching={dispatchingOrderIds[order.id]}
              onFetchQuote={fetchOrderQuote}
              onDispatchPorter={dispatchPorter}
              onOpenAssignModal={setAssigningOrder}
              onCancelPorter={cancelPorter}
            />
          ))}
        </div>
      )}

      {/* In-House Rider Assignment Modal */}
      <RiderAssignmentModal
        order={assigningOrder}
        isOpen={!!assigningOrder}
        onClose={() => setAssigningOrder(null)}
        onConfirmAssign={assignInHouseRider}
      />
    </div>
  );
}

export default DeliveryQueuePage;
