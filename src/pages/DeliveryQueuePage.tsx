import { useState, useMemo, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useOrders } from '@/hooks/useOrders';
import { useAdminAuthStore } from '@/admin/store/adminAuthStore';
import { adminOrdersService } from '@/admin/services/adminOrdersService';
import { INITIAL_RICH_ORDERS, type RichOrder } from '@/admin/pages/ordersData';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import {
  Search,
  Bike,
  Navigation,
  Phone,
  MapPin,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  Zap,
  UserCheck,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { getPorterDeliveryQuote, type PorterDeliveryQuote } from '@/services/porterDelivery';

export type DeliveryFilterStatus =
  | 'all'
  | 'pending'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'dispatched';

const deliveryStatusFilters: { value: DeliveryFilterStatus; label: string }[] = [
  { value: 'all', label: 'All Active Deliveries' },
  { value: 'pending', label: 'Placed / Pending' },
  { value: 'preparing', label: 'In Kitchen' },
  { value: 'ready', label: 'Ready for Pickup' },
  { value: 'out_for_delivery', label: 'Out for Delivery / In-Transit' },
];

const statusColors: Record<string, string> = {
  placed: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30',
  new: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30',
  pending: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30',
  accepted: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30',
  preparing: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30',
  ready: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30',
  out_for_delivery: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30',
  dispatched: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30',
  delivered: 'bg-green-500/15 text-green-600 dark:text-green-400 border border-green-500/30',
  cancelled: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30',
};

export function DeliveryQueuePage() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<DeliveryFilterStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [adminLiveOrders, setAdminLiveOrders] = useState<RichOrder[]>([]);

  // Hook for Firestore orders (Partner app session)
  const { orders: partnerOrders, isLoading: partnerLoading } = useOrders();
  const { admin } = useAdminAuthStore();

  // Listen for admin live orders if in admin portal or partner orders are empty
  useEffect(() => {
    const unsub = adminOrdersService.listenLiveOrders(
      null,
      (live) => setAdminLiveOrders(live),
      (err) => console.warn('Delivery queue live listener error:', err)
    );
    return () => unsub();
  }, []);

  // Unify and filter orders to delivery fulfillment and active statuses
  const deliveryOrders = useMemo(() => {
    const combined: any[] = [];
    const seenIds = new Set<string>();

    // 1. Ingest Partner Firestore orders
    if (partnerOrders && partnerOrders.length > 0) {
      partnerOrders.forEach((o) => {
        const fulfillment = (o as any).fulfillment || o.orderType;
        if (fulfillment === 'delivery') {
          seenIds.add(o.id);
          combined.push({
            id: o.id,
            shortCode: (o as any).shortCode || `#${o.id.slice(-6)}`,
            customerName: o.customerName || (o as any).customer?.name || 'Customer',
            customerPhone: o.customerPhone || (o as any).customer?.phone || '+91 98765 43210',
            address: o.deliveryAddress?.full || (o as any).deliveryAddress?.street || 'Ahmedabad',
            status: (o.status || 'pending').toLowerCase(),
            total: o.total || (o as any).totalAmount || 399,
            riderName: o.riderName,
            riderPhone: o.riderPhone,
            riderVehicleNumber: o.riderVehicleNumber,
            riderTrackingUrl: o.riderTrackingUrl,
            items: o.items || [],
            storeName: (o as any).store?.name || 'Burgonomics Ahmedabad',
            createdAt: o.createdAt?.toDate ? o.createdAt.toDate() : new Date(),
          });
        }
      });
    }

    // 2. Ingest Admin live/seed orders
    const sourceAdminOrders =
      adminLiveOrders.length > 0 ? adminLiveOrders : INITIAL_RICH_ORDERS;

    sourceAdminOrders.forEach((o) => {
      const fulfillment = (o.fulfillment || '').toLowerCase();
      if (fulfillment === 'delivery' && !seenIds.has(o.id)) {
        seenIds.add(o.id);
        const mappedStatus = (o.orderStatus || 'New')
          .toLowerCase()
          .replace(/\s+/g, '_');
        combined.push({
          id: o.id,
          shortCode: o.shortCode || `#${o.id.slice(-6)}`,
          customerName: o.customerEmail ? o.customerEmail.split('@')[0] : 'Aarav Mehta',
          customerPhone: o.deliveryPartner?.phone || '+91 98112 00392',
          address: o.fulfillmentInstructions || 'Satellite Road, Ahmedabad',
          status: mappedStatus,
          total: (o as any).totalAmount || (o as any).total || 499,
          riderName: o.deliveryPartner?.name,
          riderPhone: o.deliveryPartner?.phone,
          riderVehicleNumber: o.deliveryPartner?.vehicleNumber,
          riderTrackingUrl: `https://maps.google.com/?q=${encodeURIComponent(o.fulfillmentInstructions || 'Ahmedabad')}`,
          items: o.items || [],
          storeName: o.store?.name || 'Burgonomics Prahladnagar',
          createdAt: o.placedAt ? new Date(o.placedAt) : new Date(),
        });

      }
    });

    // 3. Filter by delivery allowed statuses: [placed, new, pending, accepted, preparing, ready, out_for_delivery, dispatched]
    const allowedStatuses = [
      'placed',
      'new',
      'pending',
      'accepted',
      'preparing',
      'ready',
      'out_for_delivery',
      'dispatched',
    ];

    return combined.filter((o) => {
      const statusMatch = allowedStatuses.includes(o.status);
      if (!statusMatch) return false;

      if (statusFilter !== 'all') {
        if (statusFilter === 'pending' && !['pending', 'placed', 'new'].includes(o.status))
          return false;
        if (statusFilter === 'out_for_delivery' && !['out_for_delivery', 'dispatched'].includes(o.status))
          return false;
        if (!['pending', 'out_for_delivery'].includes(statusFilter) && o.status !== statusFilter)
          return false;
      }

      if (unassignedOnly && !!o.riderName) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = o.customerName.toLowerCase().includes(q);
        const matchesId = o.id.toLowerCase().includes(q) || o.shortCode.toLowerCase().includes(q);
        const matchesAddress = o.address.toLowerCase().includes(q);
        const matchesRider = o.riderName?.toLowerCase().includes(q);
        if (!matchesName && !matchesId && !matchesAddress && !matchesRider) {
          return false;
        }
      }

      return true;
    });
  }, [partnerOrders, adminLiveOrders, statusFilter, unassignedOnly, searchQuery]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const total = deliveryOrders.length;
    const unassigned = deliveryOrders.filter((o) => !o.riderName).length;
    const inTransit = deliveryOrders.filter((o) =>
      ['out_for_delivery', 'dispatched'].includes(o.status)
    ).length;
    const readyForPickup = deliveryOrders.filter((o) => o.status === 'ready').length;
    return { total, unassigned, inTransit, readyForPickup };
  }, [deliveryOrders]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-sans">
      {/* Header & Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
              <Bike className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-text-primary">
                Delivery Queue & Fleet Dispatch
              </h1>
              <p className="text-xs text-text-secondary">
                Live monitoring for active delivery orders, Porter 3PL dispatch quotes, and rider assignments.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setStatusFilter('all');
              setSearchQuery('');
              setUnassignedOnly(false);
            }}
            className="px-3.5 py-2 rounded-xl bg-surface border border-border text-xs font-bold text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset View</span>
          </button>
        </div>
      </div>

      {/* Metric Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface rounded-2xl border border-border p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-text-secondary">
              Active Deliveries
            </span>
            <div className="w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-600 flex items-center justify-center">
              <Bike className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-text-primary mt-2">
            {metrics.total}
          </p>
          <p className="text-[11px] text-text-secondary mt-0.5">
            All active fulfillment lines
          </p>
        </div>

        <div className="bg-surface rounded-2xl border border-border p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Needs Rider
            </span>
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-2">
            {metrics.unassigned}
          </p>
          <p className="text-[11px] text-text-secondary mt-0.5">
            Pending rider dispatch
          </p>
        </div>

        <div className="bg-surface rounded-2xl border border-border p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Ready for Pickup
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-2">
            {metrics.readyForPickup}
          </p>
          <p className="text-[11px] text-text-secondary mt-0.5">
            Food packed in kitchen
          </p>
        </div>

        <div className="bg-surface rounded-2xl border border-border p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              In-Transit (Live)
            </span>
            <div className="w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-600 flex items-center justify-center">
              <Navigation className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-2">
            {metrics.inTransit}
          </p>
          <p className="text-[11px] text-text-secondary mt-0.5">
            On-road to customer
          </p>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="bg-surface rounded-2xl border border-border p-4 shadow-2xs flex flex-col md:flex-row items-stretch md:items-center gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
          <input
            type="text"
            placeholder="Search by customer name, order ID, phone, address, or rider..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-primary text-xs bg-bg/40 font-medium"
          />
        </div>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as DeliveryFilterStatus)}
          className="px-4 py-2.5 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-primary text-xs font-semibold bg-surface text-text-primary cursor-pointer"
        >
          {deliveryStatusFilters.map((filter) => (
            <option key={filter.value} value={filter.value}>
              {filter.label}
            </option>
          ))}
        </select>

        {/* Unassigned Toggle */}
        <button
          onClick={() => setUnassignedOnly(!unassignedOnly)}
          className={`px-4 py-2.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            unassignedOnly
              ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
              : 'bg-surface border-border text-text-secondary hover:text-text-primary'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>Unassigned Only</span>
        </button>
      </div>

      {/* Orders List */}
      {partnerLoading && deliveryOrders.length === 0 ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : deliveryOrders.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-border p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-indigo-500/10 text-indigo-600 flex items-center justify-center mx-auto">
            <Bike className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-text-primary">
            No delivery orders matching current filters
          </h3>
          <p className="text-xs text-text-secondary max-w-sm mx-auto">
            New customer orders with delivery fulfillment will appear here in real-time as they are placed.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {deliveryOrders.map((order) => {
            const hasRider = !!order.riderName;
            const targetUrl = admin ? `/admin/orders/${order.id}` : `/orders/${order.id}`;

            return (
              <div
                key={order.id}
                className="bg-surface rounded-2xl border border-border p-5 shadow-2xs hover:border-primary/40 transition-all flex flex-col justify-between space-y-4"
              >
                {/* Top Row: ID, Store & Status Badge */}
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-sm text-text-primary tracking-tight">
                          {order.shortCode}
                        </span>
                        <Badge className={statusColors[order.status] || 'bg-gray-100 text-gray-800'}>
                          {order.status.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-text-secondary mt-0.5">
                        {order.storeName} • {formatDistanceToNow(order.createdAt, { addSuffix: true })}
                      </p>
                    </div>

                    <span className="text-sm font-black text-primary">
                      ₹{order.total?.toLocaleString()}
                    </span>
                  </div>

                  {/* Customer Info & Address */}
                  <div className="bg-bg/50 p-3 rounded-xl border border-border space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-text-primary">
                        {order.customerName}
                      </span>
                      <a
                        href={`tel:${order.customerPhone}`}
                        className="text-primary hover:underline font-semibold flex items-center gap-1"
                      >
                        <Phone className="w-3 h-3" />
                        <span>{order.customerPhone}</span>
                      </a>
                    </div>
                    <div className="flex items-start gap-1.5 text-text-secondary text-[11px]">
                      <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5 text-text-secondary" />
                      <span className="line-clamp-2 leading-relaxed">{order.address}</span>
                    </div>
                  </div>

                  {/* Rider Assignment Status Card */}
                  <div
                    className={`p-3 rounded-xl border flex items-center justify-between gap-2 text-xs ${
                      hasRider
                        ? 'bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-900/50'
                        : 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          hasRider
                            ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300'
                            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300'
                        }`}
                      >
                        <Bike className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-text-primary truncate text-xs">
                          {hasRider ? order.riderName : 'Unassigned Delivery'}
                        </p>
                        <p className="text-[10px] text-text-secondary truncate">
                          {hasRider
                            ? `${order.riderVehicleNumber || 'GJ-01-BK-4092'} • ${order.riderPhone}`
                            : 'Requires Porter or Store Rider'}
                        </p>
                      </div>
                    </div>

                    {hasRider && order.riderTrackingUrl && (
                      <a
                        href={order.riderTrackingUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2 py-1 bg-indigo-600 text-white rounded-lg text-[10px] font-bold hover:bg-indigo-700 transition-colors flex items-center gap-1 shrink-0"
                      >
                        <Navigation className="w-3 h-3" />
                        <span>GPS</span>
                      </a>
                    )}
                  </div>

                  {/* Items summary */}
                  {order.items && order.items.length > 0 && (
                    <div className="text-[11px] text-text-secondary truncate">
                      <strong>Items:</strong>{' '}
                      {order.items
                        .map((i: any) => `${i.quantity || 1}x ${i.name || i.title}`)
                        .join(', ')}
                    </div>
                  )}
                </div>

                {/* Bottom CTA to Order Detail Page */}
                <div className="pt-3 border-t border-border flex items-center justify-between gap-2">
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(order.address)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-2 rounded-xl bg-bg border border-border text-[11px] font-bold text-text-secondary hover:text-text-primary hover:border-primary/40 transition-colors flex items-center gap-1.5"
                  >
                    <MapPin className="w-3.5 h-3.5 text-primary" />
                    <span>Maps</span>
                  </a>

                  <Link
                    to={targetUrl}
                    className="flex-1 py-2 px-4 rounded-xl bg-primary text-white hover:bg-primary-dark font-bold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
                  >
                    <span>Manage Dispatch</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
