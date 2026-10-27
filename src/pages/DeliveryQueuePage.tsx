import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  PorterDispatchCard,
  RiderAssignmentModal,
  deriveDeliveryFeedState,
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
    error: ordersError,
    refetch: refetchOrders,
    quotes,
    loadingQuotes,
    dispatchingOrderIds,
    rebookingOrderIds,
    fareConfirms,
    manualLanes,
    pastingOrderIds,
    fetchOrderQuote,
    dispatchPorter,
    confirmFareDispatch,
    dismissFareConfirm,
    savePorterManual,
    assignInHouseRider,
    cancelPorter,
    rebookPorter,
  } = usePorterLogistics();

  // Feed honesty (F06-06 regression): an errored orders read must surface a
  // real error + Retry, never "No Delivery Orders In Queue" — which reads as
  // "no work available" while orders are simply unreadable.
  const feedState = deriveDeliveryFeedState({ isLoading, error: ordersError });

  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'ready' | 'in_transit' | 'unassigned'>('all');
  const [assigningOrder, setAssigningOrder] = useState<Order | null>(null);

  // Honest connectivity: quotes only holds successful dispatch quote
  // responses from this session, so a non-empty map is the only evidence
  // we have that SOME provider's API answered (Borzo or Shadowfax — or a
  // legacy Porter quote). A quote is not provider health, and an empty map
  // is unverified, not dead.
  const dispatcherReachable = Object.keys(quotes).length > 0;

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

  // Statistics — rendered only for a readable feed: counting zeros on an
  // errored feed reads as "nothing ready" when orders are simply unreadable.
  const readyCount = deliveryOrders.filter((o) => o.status === 'ready').length;
  const inTransitCount = deliveryOrders.filter(
    (o) => o.status === 'out_for_delivery' || !!o.riderName
  ).length;
  const countsAreLive = feedState === 'ready';

  // Empty-state copy depends on WHY the list is empty: a narrow tab/search is
  // not the same claim as "everything has been allocated or completed".
  const hasActiveQueueFilters = filterTab !== 'all' || searchQuery.trim().length > 0;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16 select-none">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white tracking-wide flex items-center gap-2.5">
            <span>Delivery Queue & Courier Dispatch</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-orange-950 border border-orange-500/40 text-orange-400 font-bold">
              3PL Dispatch
            </span>
          </h1>
          <p className="text-xs text-neutral-400">
            Automated multi-provider courier allocation (Borzo / Shadowfax), live fare quotes, and in-house rider assignment
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
            <span className="font-mono text-2xl font-black text-amber-400">{countsAreLive ? `${readyCount} Orders` : '—'}</span>
          </div>
        </div>

        <div className="p-4 rounded-3xl bg-neutral-900 border border-neutral-800 flex items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-cyan-950/60 border border-cyan-800/60 text-cyan-400">
            <Bike className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-bold text-neutral-400 block uppercase">Out for Delivery</span>
            <span className="font-mono text-2xl font-black text-cyan-400">{countsAreLive ? `${inTransitCount} Couriers` : '—'}</span>
          </div>
        </div>

        <div className="p-4 rounded-3xl bg-neutral-900 border border-neutral-800 flex items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-[#0E4825] border border-emerald-500/40 text-emerald-300">
            <Zap className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-bold text-neutral-400 block uppercase">Dispatcher Status</span>
            <span
              className={`font-mono text-base font-black ${dispatcherReachable ? 'text-emerald-400' : 'text-neutral-400'}`}
              title={
                dispatcherReachable
                  ? 'A dispatch quote returned successfully this session.'
                  : 'No dispatch quote has succeeded this session — status not verified.'
              }
            >
              {dispatcherReachable ? 'Reachable ✓ (this session)' : 'Unknown — not checked'}
            </span>
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

      {/* Orders Grid — an errored feed shows the failure panel with Retry
          (mirroring OrdersPage); the "no orders" empty state renders ONLY
          once the feed is known-good, so a failed read can never claim the
          queue is empty. */}
      {feedState === 'loading' ? (
        <div
          role="status"
          aria-label="Loading delivery orders"
          className="flex justify-center py-20 text-neutral-400"
        >
          <Clock className="w-8 h-8 animate-spin mb-2" aria-hidden="true" />
        </div>
      ) : (
        <>
          {feedState === 'error' && (
            <div
              role="alert"
              className="rounded-2xl border border-rose-500/50 bg-rose-950/60 p-4 text-xs font-bold text-rose-200 flex flex-wrap items-center justify-between gap-3"
            >
              <span className="inline-flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 stroke-[2.5] text-rose-300 shrink-0" />
                Delivery order feed failed —{' '}
                {(ordersError as Error)?.message || 'check connection and permissions.'}
              </span>
              <button
                type="button"
                onClick={() => refetchOrders()}
                className="px-4 py-2 min-h-[44px] rounded-xl bg-[#0E4825] text-emerald-300 font-bold cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}

          {filteredOrders.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredOrders.map((order) => (
                <PorterDispatchCard
                  key={order.id}
                  order={order}
                  quote={quotes[order.id]}
                  loadingQuote={loadingQuotes[order.id]}
                  isDispatching={dispatchingOrderIds[order.id]}
                  isRebooking={rebookingOrderIds[order.id]}
                  fareConfirm={fareConfirms[order.id]}
                  manualLane={manualLanes[order.id]}
                  isPasting={pastingOrderIds[order.id]}
                  onFetchQuote={fetchOrderQuote}
                  onDispatchPorter={dispatchPorter}
                  onOpenAssignModal={setAssigningOrder}
                  onCancelPorter={cancelPorter}
                  onRebookPorter={rebookPorter}
                  onConfirmFare={confirmFareDispatch}
                  onDismissFareConfirm={(o) => dismissFareConfirm(o.id)}
                  onPastePorter={(o, porterOrderId, trackingUrl) =>
                    savePorterManual(o.id, porterOrderId, trackingUrl)
                  }
                />
              ))}
            </div>
          ) : (
            feedState === 'ready' && (
              <div className="text-center py-16 bg-neutral-900/40 rounded-3xl border border-dashed border-neutral-800 p-8">
                <Bike className="w-12 h-12 mx-auto text-neutral-500 mb-3" aria-hidden="true" />
                <h3 className="font-bold text-white text-base">No Delivery Orders In Queue</h3>
                <p className="text-xs text-neutral-400 mt-1">
                  {hasActiveQueueFilters
                    ? 'No delivery orders match the current tab or search.'
                    : 'All packed delivery orders have been allocated couriers or completed.'}
                </p>
              </div>
            )
          )}
        </>
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
