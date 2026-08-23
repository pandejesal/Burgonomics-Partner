import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useOrder } from '@/hooks/useOrder';
import type { OrderStatus } from '@/types';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
import {
  getPorterDeliveryQuote,
  type PorterDeliveryQuote,
} from '@/services/porterDelivery';
import {
  ArrowLeft,
  Package,
  MapPin,
  CreditCard,
  Phone,
  MessageCircle,
  Printer,
  Bike,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ExternalLink,
  ChefHat,
  X,
  Copy,
  Check,
  Navigation,
  Zap,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';

const statusColors: Record<OrderStatus, string> = {
  pending: 'bg-amber-100 text-amber-800 border-amber-300',
  accepted: 'bg-blue-100 text-blue-800 border-blue-300',
  preparing: 'bg-purple-100 text-purple-800 border-purple-300',
  ready: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  out_for_delivery: 'bg-indigo-100 text-indigo-800 border-indigo-300',
  delivered: 'bg-green-100 text-green-800 border-green-300',
  cancelled: 'bg-rose-100 text-rose-800 border-rose-300',
};

const statusSteps: { key: OrderStatus; label: string; icon: any }[] = [
  { key: 'pending', label: 'Received', icon: Clock },
  { key: 'accepted', label: 'Accepted', icon: CheckCircle2 },
  { key: 'preparing', label: 'Kitchen Prep', icon: ChefHat },
  { key: 'ready', label: 'Ready', icon: Package },
  { key: 'out_for_delivery', label: 'On Route', icon: Bike },
  { key: 'delivered', label: 'Delivered', icon: CheckCircle2 },
];

const MOCK_STORE_RIDERS = [
  { name: 'Ramesh Patel', phone: '+91 98250 11223', vehicle: 'GJ-01-EE-8821' },
  { name: 'Sanjay Varma', phone: '+91 97123 44556', vehicle: 'GJ-27-AK-1029' },
  { name: 'Jayesh Parmar', phone: '+91 99090 77881', vehicle: 'GJ-06-BQ-5544' },
];

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    order,
    isLoading,
    updateStatus,
    assignRider,
    pushToPetpooja,
    autoDispatchPorter,
  } = useOrder(id || '');

  const [copiedId, setCopiedId] = useState(false);
  const [showRiderModal, setShowRiderModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showPorterQuoteModal, setShowPorterQuoteModal] = useState(false);
  const [clientQuote, setClientQuote] = useState<PorterDeliveryQuote | null>(null);
  const [loadingClientQuote, setLoadingClientQuote] = useState(false);

  useEffect(() => {
    if (order && (order.orderType === 'delivery' || (order as any).fulfillment === 'delivery')) {
      setLoadingClientQuote(true);
      getPorterDeliveryQuote({
        dropLat: order.deliveryAddress?.lat,
        dropLng: order.deliveryAddress?.lng,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
      })
        .then((q) => {
          setClientQuote(q);
          setLoadingClientQuote(false);
        })
        .catch(() => setLoadingClientQuote(false));
    }
  }, [order]);


  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-20 bg-surface rounded-2xl border border-border">
        <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-text-primary">Order Not Found</h2>
        <p className="text-sm text-text-secondary mt-1">
          The requested order ID may have been archived or deleted.
        </p>
        <button
          onClick={() => navigate('/orders')}
          className="mt-4 px-4 py-2 bg-primary text-white text-xs font-semibold rounded-xl"
        >
          Back to Orders
        </button>
      </div>
    );
  }

  const handleCopyId = () => {
    navigator.clipboard.writeText(order.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const currentStepIndex = statusSteps.findIndex((s) => s.key === order.status);
  const isCancelled = order.status === 'cancelled';

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Bar / Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface p-4 sm:p-6 rounded-2xl border border-border shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-primary/5 rounded-xl text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-text-primary tracking-tight">
                Order #{order.id.slice(-6)}
              </h1>
              <button
                onClick={handleCopyId}
                className="p-1 text-text-secondary hover:text-primary transition-colors cursor-pointer"
                title="Copy Full ID"
              >
                {copiedId ? (
                  <Check className="w-4 h-4 text-green-600" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
              <Badge
                className={`border text-xs px-2.5 py-0.5 font-bold uppercase tracking-wider ${
                  statusColors[order.status]
                }`}
              >
                {order.status.replace('_', ' ')}
              </Badge>
            </div>
            <p className="text-xs text-text-secondary mt-0.5">
              Placed on{' '}
              {order.createdAt?.toDate
                ? format(order.createdAt.toDate(), 'dd MMM yyyy, hh:mm a')
                : 'Recently'}{' '}
              (
              {order.createdAt?.toDate
                ? formatDistanceToNow(order.createdAt.toDate(), {
                    addSuffix: true,
                  })
                : 'Just now'}
              )
            </p>
          </div>
        </div>

        {/* Action CTAs */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowReceiptModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-bg hover:bg-bg/80 text-text-primary border border-border rounded-xl text-xs font-semibold transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4 text-text-secondary" />
            <span>Print Receipt / KOT</span>
          </button>

          {order.customerPhone && (
            <>
              <a
                href={`tel:${order.customerPhone}`}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-bg hover:bg-bg/80 text-text-primary border border-border rounded-xl text-xs font-semibold transition-colors"
              >
                <Phone className="w-4 h-4 text-primary" />
                <span className="hidden md:inline">Call Customer</span>
              </a>
              <a
                href={`https://wa.me/${order.customerPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                  `Hi ${order.customerName}, regarding your Burgonomics order #${order.id.slice(
                    -6
                  )}:`
                )}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 px-3.5 py-2 bg-green-500 hover:bg-green-600 text-white rounded-xl text-xs font-semibold transition-colors shadow-xs"
              >
                <MessageCircle className="w-4 h-4" />
                <span>WhatsApp</span>
              </a>
            </>
          )}
        </div>
      </div>

      {/* Visual Status Progression Stepper */}
      {!isCancelled ? (
        <div className="bg-surface rounded-2xl border border-border p-4 sm:p-6 shadow-xs overflow-x-auto">
          <p className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-4">
            Order Fulfillment Pipeline
          </p>
          <div className="flex items-center justify-between min-w-[580px] relative">
            {/* Connecting line */}
            <div className="absolute top-5 left-6 right-6 h-1 bg-border -z-0" />
            <div
              className="absolute top-5 left-6 h-1 bg-primary transition-all duration-500 -z-0"
              style={{
                width: `${
                  currentStepIndex >= 0
                    ? (currentStepIndex / (statusSteps.length - 1)) * 90
                    : 0
                }%`,
              }}
            />

            {statusSteps.map((step, idx) => {
              const isPast = idx <= currentStepIndex;
              const isCurrent = idx === currentStepIndex;
              const IconComponent = step.icon;

              return (
                <div
                  key={step.key}
                  className="flex flex-col items-center relative z-10"
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                      isCurrent
                        ? 'bg-primary text-white border-primary ring-4 ring-primary/20 scale-110'
                        : isPast
                        ? 'bg-primary text-white border-primary'
                        : 'bg-surface text-text-secondary border-border'
                    }`}
                  >
                    <IconComponent className="w-4 h-4" />
                  </div>
                  <span
                    className={`text-xs font-semibold mt-2 ${
                      isCurrent
                        ? 'text-primary font-bold'
                        : isPast
                        ? 'text-text-primary'
                        : 'text-text-secondary'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-rose-50 border border-rose-200 p-4 rounded-2xl flex items-center gap-3 text-rose-800">
          <AlertTriangle className="w-5 h-5 shrink-0 text-rose-600" />
          <div className="text-xs">
            <p className="font-bold">This order has been cancelled.</p>
            {order.cancellationReason && (
              <p className="mt-0.5 text-rose-700">
                Reason: {order.cancellationReason}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Special Kitchen Cooking / Delivery Notes Banner */}
      {order.specialInstructions && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 text-amber-900 shadow-2xs">
          <ChefHat className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-amber-700">
              Customer Cooking & Delivery Instructions
            </p>
            <p className="text-sm font-medium mt-0.5">
              "{order.specialInstructions}"
            </p>
          </div>
        </div>
      )}

      {/* Main Grid: Order Details & Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Order Catalog Items & Kitchen KOT */}
        <div className="lg:col-span-2 space-y-6">
          {/* Order Items Table */}
          <div className="bg-surface rounded-2xl border border-border p-6 shadow-xs">
            <h2 className="font-bold text-text-primary text-base mb-4 flex items-center gap-2">
              <Package className="w-5 h-5 text-primary" />
              Order Items ({order.items?.length || 0})
            </h2>

            <div className="divide-y divide-border">
              {order.items?.map((item, index) => (
                <div
                  key={index}
                  className="py-3.5 flex items-start justify-between gap-4 first:pt-0 last:pb-0"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-md border border-accent flex items-center justify-center shrink-0 mt-0.5">
                      <span className="w-2 h-2 rounded-full bg-accent" />
                    </div>
                    <div>
                      <p className="font-bold text-text-primary text-sm">
                        {item.name}
                      </p>
                      <p className="text-xs text-text-secondary mt-0.5">
                        Qty: <strong className="text-text-primary">{item.quantity}</strong> × ₹{item.price}
                      </p>
                      {item.specialInstructions && (
                        <p className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md mt-1 inline-block">
                          Note: {item.specialInstructions}
                        </p>
                      )}
                    </div>
                  </div>

                  <p className="font-bold text-text-primary text-sm shrink-0">
                    ₹{(item.quantity * item.price).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>

            {/* Bill Summary */}
            <div className="mt-6 pt-4 border-t border-border space-y-2">
              <div className="flex justify-between text-xs text-text-secondary">
                <span>Items Subtotal</span>
                <span className="font-medium text-text-primary">
                  ₹{order.subtotal?.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between text-xs text-text-secondary">
                <span>GST & Food Taxes (5%)</span>
                <span className="font-medium text-text-primary">
                  ₹{order.tax?.toLocaleString()}
                </span>
              </div>
              {order.deliveryFee > 0 && (
                <div className="flex justify-between text-xs text-text-secondary">
                  <span>Delivery & Packaging Fee</span>
                  <span className="font-medium text-text-primary">
                    ₹{order.deliveryFee?.toLocaleString()}
                  </span>
                </div>
              )}
              <div className="flex justify-between font-black text-base pt-3 border-t border-border text-text-primary">
                <span>Grand Total</span>
                <span className="text-primary text-lg">
                  ₹{order.total?.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Petpooja POS & Kitchen KOT Integration Card */}
          <div className="bg-surface rounded-2xl border border-border p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ChefHat className="w-5 h-5 text-purple-600" />
                <h2 className="font-bold text-text-primary text-base">
                  Petpooja POS & Kitchen KOT Dispatch
                </h2>
              </div>
              <Badge
                className={
                  order.kotPrinted
                    ? 'bg-purple-100 text-purple-800'
                    : 'bg-gray-100 text-gray-700'
                }
              >
                {order.kotPrinted ? 'KOT Dispatched' : 'Pending Kitchen Push'}
              </Badge>
            </div>

            <div className="bg-bg/60 p-4 rounded-xl border border-border text-xs space-y-2 mb-4">
              <div className="flex justify-between">
                <span className="text-text-secondary">Petpooja KOT Ticket ID:</span>
                <span className="font-mono font-bold text-text-primary">
                  {order.petpoojaOrderId || 'Not dispatched to POS'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">KOT Print Status:</span>
                <span className="font-medium text-text-primary">
                  {order.kotPrinted
                    ? 'Transmitted to Thermal Kitchen Printer'
                    : 'Waiting for operator confirmation'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {!order.kotPrinted ? (
                <button
                  onClick={() => pushToPetpooja.mutate()}
                  disabled={pushToPetpooja.isPending}
                  className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <ChefHat className="w-4 h-4" />
                  <span>
                    {pushToPetpooja.isPending
                      ? 'Transmitting to POS...'
                      : '⚡ Push KOT to Petpooja Kitchen'}
                  </span>
                </button>
              ) : (
                <div className="flex items-center gap-2 text-xs text-green-700 font-semibold">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Order is live on Kitchen KOT display.</span>
                </div>
              )}
            </div>
          </div>

          {/* Delivery & Fleet Dispatch Card (for Delivery Orders) */}
          {(order.orderType === 'delivery' || (order as any).fulfillment === 'delivery') && (
            <div className="bg-surface rounded-2xl border border-border p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-600 flex items-center justify-center font-bold">
                    <Bike className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="font-bold text-text-primary text-base">
                      Delivery Fleet & Rider Dispatch
                    </h2>
                    <p className="text-[11px] text-text-secondary">
                      Real-time distance estimation, 3PL rate preview, and rider assignment.
                    </p>
                  </div>
                </div>
                <Badge
                  className={
                    order.riderName
                      ? 'bg-indigo-100 text-indigo-800 border-indigo-200'
                      : 'bg-amber-100 text-amber-800 border-amber-200'
                  }
                >
                  {order.riderName ? 'Rider Assigned' : 'Unassigned Rider'}
                </Badge>
              </div>

              {/* Haversine Fee & 3PL Distance Preview Box (clientPorterDelivery) */}
              <div className="bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-200/80 dark:border-indigo-900/40 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <span className="text-xs font-bold text-indigo-950 dark:text-indigo-200 uppercase tracking-wider">
                      Porter 3PL Rate Preview (Haversine)
                    </span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-200/60 text-indigo-900 dark:bg-indigo-900/60 dark:text-indigo-200">
                    Standby • Mock Coords
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="bg-surface/80 p-2.5 rounded-lg border border-indigo-100 dark:border-indigo-900/30">
                    <span className="text-[10px] text-text-secondary block font-semibold">Route Distance</span>
                    <span className="font-black text-text-primary text-sm">
                      {loadingClientQuote ? '...' : `~${clientQuote?.estimatedDistanceKm || 2.4} km`}
                    </span>
                  </div>
                  <div className="bg-surface/80 p-2.5 rounded-lg border border-indigo-100 dark:border-indigo-900/30">
                    <span className="text-[10px] text-text-secondary block font-semibold">Estimated Fare</span>
                    <span className="font-black text-indigo-700 dark:text-indigo-400 text-sm">
                      {loadingClientQuote ? '...' : `₹${clientQuote?.estimatedFare || 44}`}
                    </span>
                  </div>
                  <div className="bg-surface/80 p-2.5 rounded-lg border border-indigo-100 dark:border-indigo-900/30">
                    <span className="text-[10px] text-text-secondary block font-semibold">Pickup ETA</span>
                    <span className="font-black text-text-primary text-sm">
                      {loadingClientQuote ? '...' : `~${clientQuote?.estimatedPickupMinutes || 6} mins`}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-indigo-900/80 dark:text-indigo-300/80 pt-1">
                  <span>Standard Rate Card: <strong>₹40 for first 2 km</strong> + <strong>₹10/km</strong> thereafter</span>
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                      order.deliveryAddress?.full || (order.deliveryAddress as any)?.street || 'Ahmedabad'
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline font-bold"
                  >
                    <MapPin className="w-3 h-3" />
                    <span>Open in Maps</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
              </div>

              {/* Rider Assignment Info or Dispatch Controls */}
              {order.riderName ? (
                <div className="space-y-3">
                  <div className="bg-bg/60 p-4 rounded-xl border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center shrink-0">
                        {order.riderName.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-text-primary text-sm">
                            {order.riderName}
                          </p>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                            Dispatched
                          </span>
                        </div>
                        <p className="text-xs text-text-secondary mt-0.5">
                          Vehicle: <strong className="text-text-primary">{order.riderVehicleNumber || 'GJ-01-BK-4092'}</strong> • {order.riderPhone}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <a
                        href={`tel:${order.riderPhone}`}
                        className="px-3 py-1.5 bg-surface border border-border rounded-lg text-xs font-semibold hover:bg-primary/5 transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <Phone className="w-3.5 h-3.5 text-primary" />
                        <span>Call</span>
                      </a>
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                          order.deliveryAddress?.full || (order.deliveryAddress as any)?.street || 'Ahmedabad'
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                      >
                        <Navigation className="w-3.5 h-3.5" />
                        <span>Directions</span>
                      </a>
                    </div>
                  </div>


                  <div className="flex items-center justify-between text-xs pt-1">
                    {order.status === 'out_for_delivery' && (
                      <button
                        onClick={() => updateStatus.mutate({ status: 'delivered' })}
                        disabled={updateStatus.isPending}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-2xs cursor-pointer transition-colors"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Confirm Order Delivered</span>
                      </button>
                    )}
                    <button
                      onClick={() => setShowRiderModal(true)}
                      className="text-xs text-indigo-600 hover:underline font-semibold cursor-pointer ml-auto"
                    >
                      Change or Reassign Rider →
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3.5">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    <p className="text-xs text-text-secondary">
                      Dispatch this order to Porter 3PL on-demand fleet or pick a store rider:
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowPorterQuoteModal(true)}
                        className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                      >
                        <Zap className="w-3.5 h-3.5 text-amber-300" />
                        <span>Auto-Dispatch Porter</span>
                      </button>

                      <button
                        onClick={() => setShowRiderModal(true)}
                        className="px-3.5 py-2 bg-bg hover:bg-bg/80 text-text-primary border border-border rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <span>Manual Input</span>
                      </button>
                    </div>
                  </div>

                  {/* Mock Rider Quick Selector Chips */}
                  <div className="space-y-1.5 pt-2 border-t border-border">
                    <span className="text-[11px] font-bold text-text-secondary uppercase tracking-wider block">
                      Quick-Assign Store Fleet Rider:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {MOCK_STORE_RIDERS.map((r) => (
                        <button
                          key={r.name}
                          type="button"
                          onClick={() =>
                            assignRider.mutate({
                              riderName: r.name,
                              riderPhone: r.phone,
                              riderVehicleNumber: r.vehicle,
                              markOutForDelivery: true,
                            })
                          }
                          disabled={assignRider.isPending}
                          className="p-2.5 rounded-xl border border-border bg-surface hover:border-primary hover:bg-primary/5 text-left transition-all group cursor-pointer"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-xs text-text-primary group-hover:text-primary">
                              {r.name}
                            </span>
                            <Bike className="w-3.5 h-3.5 text-text-secondary group-hover:text-primary" />
                          </div>
                          <p className="text-[10px] text-text-secondary mt-0.5 truncate">
                            {r.vehicle} • {r.phone}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Sidebar: Customer, Address, Payment & Status Operations */}
        <div className="space-y-6">
          {/* Status Operations Controller */}
          {!isCancelled && (
            <div className="bg-surface rounded-2xl border border-border p-6 shadow-xs space-y-4">
              <h2 className="font-bold text-text-primary text-base">
                Fulfillment Controls
              </h2>

              <div className="space-y-2">
                {order.status === 'pending' && (
                  <button
                    onClick={() => updateStatus.mutate({ status: 'accepted' })}
                    disabled={updateStatus.isPending}
                    className="w-full py-3 bg-primary hover:bg-primary-dark text-white rounded-xl font-bold text-sm transition-colors shadow-xs cursor-pointer"
                  >
                    Accept Order
                  </button>
                )}

                {order.status === 'accepted' && (
                  <button
                    onClick={() => {
                      updateStatus.mutate({ status: 'preparing' });
                      if (!order.kotPrinted) pushToPetpooja.mutate();
                    }}
                    disabled={updateStatus.isPending}
                    className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-sm transition-colors shadow-xs cursor-pointer flex items-center justify-center gap-2"
                  >
                    <ChefHat className="w-4 h-4" />
                    <span>Send to Kitchen & Prep</span>
                  </button>
                )}

                {order.status === 'preparing' && (
                  <button
                    onClick={() => updateStatus.mutate({ status: 'ready' })}
                    disabled={updateStatus.isPending}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm transition-colors shadow-xs cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Package className="w-4 h-4" />
                    <span>Mark as Food Ready</span>
                  </button>
                )}

                {order.status === 'ready' && order.orderType === 'delivery' && (
                  <button
                    onClick={() => {
                      if (!order.riderName) {
                        setShowPorterQuoteModal(true);
                      } else {
                        updateStatus.mutate({ status: 'out_for_delivery' });
                      }
                    }}
                    disabled={updateStatus.isPending}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition-colors shadow-xs cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Bike className="w-4 h-4" />
                    <span>Dispatch (Out for Delivery)</span>
                  </button>
                )}

                {(order.status === 'ready' && order.orderType !== 'delivery') && (
                  <button
                    onClick={() => updateStatus.mutate({ status: 'delivered' })}
                    disabled={updateStatus.isPending}
                    className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-sm transition-colors shadow-xs cursor-pointer"
                  >
                    Mark Handed Over / Completed
                  </button>
                )}

                {order.status === 'out_for_delivery' && (
                  <button
                    onClick={() => updateStatus.mutate({ status: 'delivered' })}
                    disabled={updateStatus.isPending}
                    className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-sm transition-colors shadow-xs cursor-pointer flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirm Delivery Complete</span>
                  </button>
                )}

                {order.status !== 'delivered' && (
                  <button
                    onClick={() => setShowCancelModal(true)}
                    className="w-full py-2 text-rose-600 hover:bg-rose-50 rounded-xl font-semibold text-xs transition-colors cursor-pointer mt-2"
                  >
                    Cancel Order
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Customer Card */}
          <div className="bg-surface rounded-2xl border border-border p-6 shadow-xs">
            <h2 className="font-bold text-text-primary text-sm uppercase tracking-wider mb-3">
              Customer Information
            </h2>
            <div className="space-y-2.5 text-xs">
              <div>
                <p className="font-bold text-text-primary text-sm">
                  {order.customerName}
                </p>
                <p className="text-text-secondary mt-0.5">{order.customerPhone}</p>
              </div>
              <div className="pt-2 border-t border-border">
                <span className="text-text-secondary">Order Type:</span>
                <p className="font-bold text-text-primary capitalize mt-0.5">
                  {order.orderType} {order.tableNumber ? `(Table ${order.tableNumber})` : ''}
                </p>
              </div>
            </div>
          </div>

          {/* Delivery Address */}
          {order.orderType === 'delivery' && order.deliveryAddress && (
            <div className="bg-surface rounded-2xl border border-border p-6 shadow-xs">
              <h2 className="font-bold text-text-primary text-sm uppercase tracking-wider mb-3 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-primary" />
                Delivery Address
              </h2>
              <p className="text-xs text-text-primary leading-relaxed">
                {order.deliveryAddress.full}
              </p>
              {order.deliveryAddress.lat && order.deliveryAddress.lng && (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${order.deliveryAddress.lat},${order.deliveryAddress.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 text-xs text-primary font-bold hover:underline"
                >
                  <span>Open in Google Maps</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          )}

          {/* Payment Card */}
          <div className="bg-surface rounded-2xl border border-border p-6 shadow-xs">
            <h2 className="font-bold text-text-primary text-sm uppercase tracking-wider mb-3 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-secondary-dark" />
              Payment Details
            </h2>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-text-secondary">Payment Method:</span>
                <span className="font-bold text-text-primary uppercase">
                  {order.paymentMethod}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-text-secondary">Payment Status:</span>
                <Badge
                  className={
                    order.paymentStatus === 'completed'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-amber-100 text-amber-800'
                  }
                >
                  {order.paymentStatus}
                </Badge>
              </div>
              <div className="flex justify-between pt-2 border-t border-border">
                <span className="text-text-secondary">Amount Collected:</span>
                <span className="font-bold text-text-primary">
                  ₹{order.total?.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Porter 3PL Instant Quote & Dispatch Modal */}
      {showPorterQuoteModal && (
        <PorterQuoteModal
          order={order}
          onClose={() => setShowPorterQuoteModal(false)}
          onConfirmDispatch={async () => {
            await autoDispatchPorter.mutateAsync();
            setShowPorterQuoteModal(false);
          }}
          isPending={autoDispatchPorter.isPending}
        />
      )}

      {/* Assign Rider Modal */}
      {showRiderModal && (
        <AssignRiderModal
          onClose={() => setShowRiderModal(false)}
          onAssign={async (data) => {
            await assignRider.mutateAsync(data);
            setShowRiderModal(false);
          }}
          isPending={assignRider.isPending}
        />
      )}

      {/* Cancel Order Modal */}
      {showCancelModal && (
        <CancelOrderModal
          onClose={() => setShowCancelModal(false)}
          onConfirm={async (reason) => {
            await updateStatus.mutateAsync({ status: 'cancelled', cancellationReason: reason });
            setShowCancelModal(false);
          }}
          isPending={updateStatus.isPending}
        />
      )}

      {/* Thermal Receipt Print Modal */}
      {showReceiptModal && (
        <ReceiptModal order={order} onClose={() => setShowReceiptModal(false)} />
      )}
    </div>
  );
}

// Sub-component: Porter 3PL Quote & Dispatch Modal
function PorterQuoteModal({
  order,
  onClose,
  onConfirmDispatch,
  isPending,
}: {
  order: any;
  onClose: () => void;
  onConfirmDispatch: () => Promise<void>;
  isPending: boolean;
}) {
  const [quote, setQuote] = useState<PorterDeliveryQuote | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(true);

  useEffect(() => {
    getPorterDeliveryQuote({
      dropLat: order.deliveryAddress?.lat,
      dropLng: order.deliveryAddress?.lng,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
    }).then((q) => {
      setQuote(q);
      setLoadingQuote(false);
    });
  }, [order]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 font-sans">
      <div className="bg-surface rounded-2xl w-full max-w-md p-6 border border-border shadow-xl">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-300 font-black text-xs">
              P
            </div>
            <div>
              <h2 className="text-base font-bold text-text-primary">Porter Express Dispatch</h2>
              <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest block">
                Pre-Flight Dry Run (?dryRun=true • wouldCreate: true)
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-primary/5 rounded-lg text-text-secondary cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loadingQuote ? (
          <div className="py-8 flex flex-col items-center justify-center gap-2">
            <Spinner size="md" />
            <p className="text-xs text-text-secondary">Calculating Haversine distance & fetching quote...</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-indigo-50/70 dark:bg-indigo-950/20 border border-indigo-200 rounded-xl p-4 space-y-2.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-text-secondary">Simulation Mode:</span>
                <span className="font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/60 px-2 py-0.5 rounded-full text-[10px]">
                  Dry Run Validated (wouldCreate: true)
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-text-secondary">Vehicle Category:</span>
                <span className="font-bold text-indigo-900 dark:text-indigo-200">{quote?.vehicleType}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-text-secondary">Estimated Route Distance:</span>
                <span className="font-bold text-indigo-900 dark:text-indigo-200">{quote?.estimatedDistanceKm} km</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-text-secondary">Estimated Rider Pickup ETA:</span>
                <span className="font-bold text-indigo-900 dark:text-indigo-200">~{quote?.estimatedPickupMinutes} mins</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-text-secondary">Quote ID:</span>
                <span className="font-mono text-[11px] text-text-secondary">{quote?.quoteId}</span>
              </div>
              <div className="flex justify-between items-center text-sm pt-2 border-t border-indigo-200/80 font-black">
                <span className="text-indigo-950 dark:text-indigo-200">Total Delivery Fare:</span>
                <span className="text-indigo-700 dark:text-indigo-400 text-base">₹{quote?.estimatedFare}</span>
              </div>
            </div>

            <div className="text-xs space-y-1 bg-bg/50 p-3 rounded-xl border border-border">
              <p className="text-text-secondary">
                <strong className="text-text-primary">Drop Destination:</strong> {order.deliveryAddress?.full || order.deliveryAddress?.street || 'Ahmedabad'}
              </p>
              <p className="text-text-secondary">
                <strong className="text-text-primary">Recipient:</strong> {order.customerName} ({order.customerPhone})
              </p>
            </div>

            <div className="flex gap-3 pt-3 border-t border-border">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 border border-border rounded-xl font-semibold text-xs hover:bg-primary/5 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirmDispatch}
                disabled={isPending}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs disabled:opacity-50 shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Bike className="w-4 h-4" />
                <span>{isPending ? 'Dispatching...' : 'Confirm & Dispatch Porter'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Sub-component: Assign Rider Modal
function AssignRiderModal({
  onClose,
  onAssign,
  isPending,
}: {
  onClose: () => void;
  onAssign: (data: any) => Promise<void>;
  isPending: boolean;
}) {
  const [riderName, setRiderName] = useState('');
  const [riderPhone, setRiderPhone] = useState('');
  const [riderVehicle, setRiderVehicle] = useState('GJ-01-BK-4092');

  const handleSelectPreset = (r: { name: string; phone: string; vehicle: string }) => {
    setRiderName(r.name);
    setRiderPhone(r.phone);
    setRiderVehicle(r.vehicle);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!riderName.trim() || !riderPhone.trim()) return;
    onAssign({
      riderName: riderName.trim(),
      riderPhone: riderPhone.trim(),
      riderVehicleNumber: riderVehicle.trim(),
      markOutForDelivery: true,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 font-sans">
      <div className="bg-surface rounded-2xl w-full max-w-md p-6 border border-border shadow-xl space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-border">
          <div>
            <h2 className="text-base font-bold text-text-primary">Assign Store Fleet Rider</h2>
            <p className="text-[11px] text-text-secondary">Choose a store rider or input manually.</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-primary/5 rounded-lg text-text-secondary cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mock Store Rider Quick Selection */}
        <div className="space-y-1.5">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-text-secondary">
            Quick Select Store Rider:
          </label>
          <div className="grid grid-cols-3 gap-2">
            {MOCK_STORE_RIDERS.map((r) => (
              <button
                key={r.name}
                type="button"
                onClick={() => handleSelectPreset(r)}
                className={`p-2 rounded-xl border text-left transition-all text-xs cursor-pointer ${
                  riderName === r.name
                    ? 'border-indigo-600 bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200'
                    : 'border-border bg-bg/50 hover:bg-primary/5 text-text-primary'
                }`}
              >
                <p className="font-bold truncate">{r.name}</p>
                <p className="text-[10px] text-text-secondary truncate">{r.vehicle}</p>
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 pt-2 border-t border-border">
          <div>
            <label className="block text-xs font-semibold text-text-primary mb-1">Rider Full Name</label>
            <input
              type="text"
              value={riderName}
              onChange={(e) => setRiderName(e.target.value)}
              placeholder="e.g. Ramesh Patel"
              className="w-full px-3.5 py-2 rounded-xl border border-border text-xs focus:outline-none focus:ring-2 focus:ring-primary bg-bg/50"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-primary mb-1">Rider Phone Number</label>
            <input
              type="tel"
              value={riderPhone}
              onChange={(e) => setRiderPhone(e.target.value)}
              placeholder="+91 98250 11223"
              className="w-full px-3.5 py-2 rounded-xl border border-border text-xs focus:outline-none focus:ring-2 focus:ring-primary bg-bg/50"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-primary mb-1">Vehicle Registration Number</label>
            <input
              type="text"
              value={riderVehicle}
              onChange={(e) => setRiderVehicle(e.target.value)}
              placeholder="GJ-01-EE-8821"
              className="w-full px-3.5 py-2 rounded-xl border border-border text-xs focus:outline-none focus:ring-2 focus:ring-primary bg-bg/50"
            />
          </div>

          <div className="flex gap-3 pt-3 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-border rounded-xl font-semibold text-xs hover:bg-primary/5 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || !riderName.trim() || !riderPhone.trim()}
              className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-xs disabled:opacity-50 shadow-xs cursor-pointer"
            >
              {isPending ? 'Assigning...' : 'Confirm & Dispatch'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Sub-component: Cancel Order Modal
function CancelOrderModal({
  onClose,
  onConfirm,
  isPending,
}: {
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
  isPending: boolean;
}) {
  const [reason, setReason] = useState('Out of stock / Ingredient unavailable');

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl w-full max-w-md p-6 border border-border shadow-xl">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-border">
          <h2 className="text-base font-bold text-rose-600 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            <span>Cancel Order</span>
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-primary/5 rounded-lg text-text-secondary cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-text-secondary mb-3">
          Please select a cancellation reason. The customer will receive an immediate SMS alert and automated refund if prepaid.
        </p>

        <div className="space-y-2 mb-4">
          {[
            'Out of stock / Ingredient unavailable',
            'Kitchen at maximum capacity / High rush',
            'Customer requested cancellation',
            'Store closing / Utility maintenance',
            'Address outside delivery radius',
          ].map((r) => (
            <label key={r} className="flex items-center gap-2.5 p-2 rounded-xl border border-border hover:bg-bg/60 cursor-pointer text-xs">
              <input
                type="radio"
                name="cancelReason"
                checked={reason === r}
                onChange={() => setReason(r)}
                className="text-primary focus:ring-primary"
              />
              <span className="font-medium text-text-primary">{r}</span>
            </label>
          ))}
        </div>

        <div className="flex gap-3 pt-3 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 border border-border rounded-xl font-semibold text-xs hover:bg-primary/5 cursor-pointer"
          >
            Go Back
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason)}
            disabled={isPending}
            className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-semibold text-xs disabled:opacity-50 shadow-xs cursor-pointer"
          >
            {isPending ? 'Cancelling...' : 'Confirm Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Sub-component: Printable Receipt Modal
function ReceiptModal({ order, onClose }: { order: any; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl w-full max-w-sm p-6 border border-border shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <h2 className="text-sm font-bold text-text-primary">Thermal Receipt Slip (80mm)</h2>
          <button onClick={onClose} className="p-1 hover:bg-primary/5 rounded-lg text-text-secondary cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Printable slip view */}
        <div className="overflow-y-auto my-4 p-4 bg-white border border-dashed border-gray-300 font-mono text-xs text-gray-900 space-y-3">
          <div className="text-center border-b border-dashed border-gray-300 pb-2">
            <p className="font-black text-sm uppercase">BURGONOMICS</p>
            <p className="text-[10px] text-gray-600">Pure Veg Burgers & Shakes</p>
            <p className="text-[10px] text-gray-600">GSTIN: 24AAACB1234D1Z0</p>
          </div>

          <div className="text-[11px] space-y-1">
            <p><strong>Order:</strong> #{order.id.slice(-6)}</p>
            <p><strong>Date:</strong> {order.createdAt?.toDate ? format(order.createdAt.toDate(), 'dd/MM/yyyy HH:mm') : 'Now'}</p>
            <p><strong>Customer:</strong> {order.customerName}</p>
            <p><strong>Type:</strong> {order.orderType.toUpperCase()}</p>
          </div>

          <div className="border-t border-b border-dashed border-gray-300 py-2 space-y-1.5">
            {order.items?.map((item: any, i: number) => (
              <div key={i} className="flex justify-between text-[11px]">
                <span>{item.quantity}x {item.name}</span>
                <span>₹{item.quantity * item.price}</span>
              </div>
            ))}
          </div>

          <div className="space-y-1 text-[11px] pt-1">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>₹{order.subtotal}</span>
            </div>
            <div className="flex justify-between">
              <span>GST (5%):</span>
              <span>₹{order.tax}</span>
            </div>
            {order.deliveryFee > 0 && (
              <div className="flex justify-between">
                <span>Delivery:</span>
                <span>₹{order.deliveryFee}</span>
              </div>
            )}
            <div className="flex justify-between font-black text-sm pt-1 border-t border-gray-300">
              <span>TOTAL:</span>
              <span>₹{order.total}</span>
            </div>
          </div>

          <div className="text-center text-[10px] text-gray-500 pt-2 border-t border-dashed border-gray-300">
            <p>Thank you for choosing Burgonomics!</p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="flex-1 py-2.5 bg-primary text-white rounded-xl font-bold text-xs hover:bg-primary-dark cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Printer className="w-4 h-4" />
            <span>Print to Thermal Printer</span>
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 border border-border rounded-xl font-semibold text-xs hover:bg-primary/5 cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default OrderDetailPage;
