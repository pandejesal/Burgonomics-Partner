import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useOrder } from '@/hooks/useOrder';
import {
  KOTPrintPreview,
  OrderStatusStepper,
  OrderCancelRefundModal,
  OrderStatusBadge,
} from '@/features/orders';
import {
  getPorterDeliveryQuote,
  type PorterDeliveryQuote,
} from '@/services/porterDelivery';
import {
  ArrowLeft,
  Printer,
  Bike,
  Phone,
  MessageCircle,
  MapPin,
  ExternalLink,
  AlertTriangle,
  Copy,
  Check,
  RefreshCw,
  XCircle,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import type { OrderStatus } from '@/types';
import { ConfirmDialog } from '../admin/components/Utilities';

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const {
    order,
    isLoading,
    updateStatus,
    pushToPetpooja,
    autoDispatchPorter,
  } = useOrder(id || '');

  const [copiedId, setCopiedId] = useState(false);
  const [showKOTModal, setShowKOTModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isSyncingPetpooja, setIsSyncingPetpooja] = useState(false);

  // Porter quote state
  const [porterQuote, setPorterQuote] = useState<PorterDeliveryQuote | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [isDispatchingPorter, setIsDispatchingPorter] = useState(false);
  // Loop: dispatch books a real paid courier — confirm first (same as the
  // PorterDispatchCard confirm; fare shown before commit).
  const [confirmPorterDispatch, setConfirmPorterDispatch] = useState(false);

  useEffect(() => {
    if (order && (order.orderType === 'delivery' || (order as any).fulfillment === 'delivery')) {
      setLoadingQuote(true);
      getPorterDeliveryQuote({
        dropLat: order.deliveryAddress?.lat,
        dropLng: order.deliveryAddress?.lng,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
      })
        .then((q) => {
          setPorterQuote(q);
          setLoadingQuote(false);
        })
        .catch((err) => {
          setLoadingQuote(false);
          // Never swallow: a missing quote looks identical to "free delivery".
          toast.error("Delivery quote failed", {
            description: err instanceof Error ? err.message : "Could not reach the dispatcher.",
          });
        });
    }
  }, [order]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-neutral-400">
        <Clock className="w-10 h-10 animate-spin mb-3 text-[#0E4825]" />
        <p className="text-sm font-bold">Loading order details...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-20 bg-neutral-900/60 rounded-3xl border border-neutral-800 max-w-xl mx-auto my-12 p-8">
        <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
        <h2 className="text-lg font-black text-white">Order Not Found</h2>
        <p className="text-xs text-neutral-400 mt-1">
          The requested order ID may have been archived or deleted.
        </p>
        <Link
          to="/orders"
          className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 bg-[#0E4825] text-emerald-300 font-bold text-xs rounded-xl shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Live Orders</span>
        </Link>
      </div>
    );
  }

  const shortCode =
    (order as any).shortCode ||
    (order as any).orderNumber ||
    order.id.slice(-6).toUpperCase();

  const handleCopyId = () => {
    navigator.clipboard.writeText(order.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleStatusChange = async (nextStatus: OrderStatus) => {
    setIsUpdatingStatus(true);
    try {
      if (updateStatus && typeof updateStatus.mutateAsync === 'function') {
        await updateStatus.mutateAsync({ status: nextStatus });
      }
      toast.success(`Order status advanced to ${nextStatus.toUpperCase()}`);
    } catch (err) {
      toast.error('Failed to update status');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleCancelAndRefund = async (reason: string, notes: string, shouldRefund: boolean) => {
    try {
      if (updateStatus && typeof updateStatus.mutateAsync === 'function') {
        await updateStatus.mutateAsync({
          status: 'cancelled',
          cancellationReason: notes ? `${reason}: ${notes}` : reason,
        });
      }
      toast.success(
        `Order cancelled (${reason}).${shouldRefund ? ' Process the refund from Payments to complete it.' : ''}`
      );
    } catch (err) {
      toast.error('Failed to cancel order — no changes were made.');
      throw err;
    }
  };

  const handlePetpoojaSync = async () => {
    setIsSyncingPetpooja(true);
    try {
      if (pushToPetpooja && typeof pushToPetpooja.mutateAsync === 'function') {
        await pushToPetpooja.mutateAsync();
      }
      toast.success('Successfully synchronized with Petpooja POS');
    } catch (err) {
      toast.error('Petpooja sync failed');
    } finally {
      setIsSyncingPetpooja(false);
    }
  };

  const handleDispatchPorterRider = async () => {
    setIsDispatchingPorter(true);
    try {
      if (autoDispatchPorter && typeof autoDispatchPorter.mutateAsync === 'function') {
        await autoDispatchPorter.mutateAsync();
      }
      toast.success('Porter courier successfully dispatched!');
    } catch (err) {
      toast.error('Porter dispatch failed');
    } finally {
      setIsDispatchingPorter(false);
    }
  };

  const isDelivery = order.orderType === 'delivery';
  const isTakeaway = order.orderType === 'takeaway';
  const isDineIn = order.orderType === 'dinein';

  const addressText =
    order.deliveryAddress?.full ||
    (order.deliveryAddress as any)?.street ||
    (order.deliveryAddress as any)?.address ||
    order.deliveryAddress?.label ||
    'Store Pickup';

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* Top Header & Breadcrumbs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-5 rounded-2xl bg-neutral-900 border border-neutral-800 shadow-md">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/orders')}
            className="p-2.5 rounded-xl bg-neutral-950 border border-neutral-700 text-neutral-400 hover:text-white transition-colors cursor-pointer"
            title="Back to Orders Stream"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Order #{shortCode}
              </h1>
              <button
                type="button"
                onClick={handleCopyId}
                className="p-1 rounded text-neutral-400 hover:text-white cursor-pointer"
                title="Copy Full Order ID"
              >
                {copiedId ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-neutral-400 flex items-center gap-2 mt-0.5">
              <span>{order.branchName || 'Burgonomics Store'}</span>
              <span>•</span>
              <span className="capitalize">{order.orderType}</span>
            </p>
          </div>
        </div>

        {/* Top Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Thermal KOT Print */}
          <button
            type="button"
            onClick={() => setShowKOTModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-neutral-950 border border-neutral-700 hover:bg-neutral-800 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4 text-[#FF6600]" />
            <span>Print 80mm KOT</span>
          </button>

          {/* Petpooja Sync Button */}
          <button
            type="button"
            disabled={isSyncingPetpooja}
            onClick={handlePetpoojaSync}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-neutral-950 border border-neutral-700 hover:bg-neutral-800 text-neutral-300 hover:text-white font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncingPetpooja ? 'animate-spin' : ''}`} />
            <span>{order.petpoojaOrderId ? 'Re-sync POS' : 'Sync Petpooja'}</span>
          </button>

          {/* Cancel Order */}
          {order.status !== 'cancelled' && order.status !== 'delivered' && (
            <button
              type="button"
              onClick={() => setShowCancelModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-950/60 hover:bg-rose-900 border border-rose-800/60 text-rose-300 font-bold text-xs transition-colors cursor-pointer"
            >
              <XCircle className="w-4 h-4" />
              <span>Cancel / Refund</span>
            </button>
          )}
        </div>
      </div>

      {/* Order Status Stepper */}
      <OrderStatusStepper
        currentStatus={order.status}
        onUpdateStatus={handleStatusChange}
        isSubmitting={isUpdatingStatus}
      />

      {/* Main Grid: Order Details & Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Items & Bill Calculation */}
        <div className="lg:col-span-2 space-y-6">
          {/* Items Summary Table */}
          <div className="p-5 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <h2 className="text-sm font-black uppercase tracking-wider text-white">
                Ordered Items ({order.items?.length || 0})
              </h2>
              <OrderStatusBadge status={order.status} />
            </div>

            <div className="divide-y divide-neutral-850">
              {(order.items || []).map((item, idx) => {
                const itemTotal = item.quantity * item.price;
                const modifiers = (item as any).modifiers || (item as any).addons || [];

                return (
                  <div key={idx} className="py-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-white text-sm">
                        <span className="font-mono text-[#FF6600] mr-2">x{item.quantity}</span>
                        {item.name}
                      </p>
                      {modifiers.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {modifiers.map((mod: string, mIdx: number) => (
                            <span
                              key={mIdx}
                              className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-950/60 border border-orange-800/40 text-orange-300"
                            >
                              + {mod}
                            </span>
                          ))}
                        </div>
                      )}
                      {(item as any).specialInstructions && (
                        <p className="text-[11px] text-red-400 font-bold mt-1">
                          * Note: {(item as any).specialInstructions}
                        </p>
                      )}
                    </div>

                    <div className="text-right font-mono">
                      <p className="font-black text-white text-sm">₹{itemTotal}</p>
                      <p className="text-[11px] text-neutral-500">₹{item.price} each</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Special Instructions */}
            {order.specialInstructions && (
              <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 text-xs text-neutral-300">
                <span className="font-bold text-amber-400 block mb-0.5">Chef Instructions:</span>
                <p>{order.specialInstructions}</p>
              </div>
            )}

            {/* Pricing Math Summary */}
            <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-2 text-xs text-neutral-400">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="font-mono text-white">₹{order.subtotal || order.total}</span>
              </div>
              <div className="flex justify-between">
                <span>GST (5%)</span>
                <span className="font-mono text-white">₹{order.tax || 0}</span>
              </div>
              {order.deliveryFee ? (
                <div className="flex justify-between">
                  <span>Delivery Fee</span>
                  <span className="font-mono text-white">₹{order.deliveryFee}</span>
                </div>
              ) : null}
              <div className="flex justify-between pt-2 border-t border-neutral-800 text-base font-black text-white">
                <span>Grand Total</span>
                <span className="font-mono text-[#FF6600]">₹{order.total}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right 1 Column: Customer, Delivery, & Logistics */}
        <div className="space-y-6">
          {/* Customer Profile Card */}
          <div className="p-5 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-neutral-400">
              Customer Information
            </h3>

            <div>
              <p className="font-bold text-white text-sm">{order.customerName}</p>
              <p className="font-mono text-xs text-neutral-400 mt-0.5">{order.customerPhone}</p>
            </div>

            {/* 1-Tap Quick Contact */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <a
                href={`tel:${order.customerPhone}`}
                className="py-2 px-3 rounded-xl bg-neutral-950 hover:bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                <Phone className="w-3.5 h-3.5 text-emerald-400" />
                <span>Call Client</span>
              </a>

              <a
                href={`https://wa.me/${order.customerPhone.replace(/[^0-9]/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="py-2 px-3 rounded-xl bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-800/60 text-emerald-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>WhatsApp</span>
              </a>
            </div>
          </div>

          {/* Fulfillment & Delivery Card */}
          <div className="p-5 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wider text-neutral-400">
                Fulfillment Type
              </h3>
              {isDelivery && (
                <span className="px-2 py-0.5 rounded bg-orange-950 text-orange-400 font-bold text-[10px] uppercase">
                  Delivery
                </span>
              )}
              {isTakeaway && (
                <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 font-bold text-[10px] uppercase">
                  Takeaway
                </span>
              )}
              {isDineIn && (
                <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 font-bold text-[10px] uppercase">
                  Dine-In (T-{order.tableNumber || '01'})
                </span>
              )}
            </div>

            {isDelivery && order.deliveryAddress && (
              <div className="space-y-2 text-xs">
                <div className="flex items-start gap-2 text-neutral-300">
                  <MapPin className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">{addressText}</p>
                  </div>
                </div>

                {order.deliveryAddress.lat && order.deliveryAddress.lng && (
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${order.deliveryAddress.lat},${order.deliveryAddress.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-[#FF6600] hover:underline"
                  >
                    <span>Open in Google Maps</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            )}

            {/* Porter Delivery Dispatch Section */}
            {isDelivery && (
              <div className="pt-3 border-t border-neutral-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-neutral-400">Porter Courier:</span>
                  <span className="font-mono text-emerald-400 font-bold">
                    {loadingQuote
                      ? 'Fetching quote...'
                      : porterQuote
                      ? `₹${porterQuote.estimatedFare} (${porterQuote.estimatedPickupMinutes}m)`
                      : 'Available'}
                  </span>
                </div>

                <button
                  type="button"
                  disabled={isDispatchingPorter || order.status === 'delivered' || order.status === 'cancelled'}
                  onClick={() => setConfirmPorterDispatch(true)}
                  className="w-full py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-md transition-all cursor-pointer disabled:opacity-50 min-h-[44px]"
                >
                  <Bike className="w-4 h-4" />
                  <span>{isDispatchingPorter ? 'Dispatching...' : 'Dispatch Porter Rider'}</span>
                </button>
                {confirmPorterDispatch && (
                  <ConfirmDialog
                    isOpen={true}
                    onClose={() => setConfirmPorterDispatch(false)}
                    onConfirm={() => {
                      setConfirmPorterDispatch(false);
                      void handleDispatchPorterRider();
                    }}
                    title="Dispatch Porter rider?"
                    description={`This books a real paid courier${porterQuote ? ` at an estimated fare of ₹${porterQuote.estimatedFare} (ETA ${porterQuote.estimatedPickupMinutes}m)` : ''}. This action spends money.`}
                    confirmLabel="Dispatch Rider"
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* KOT Print Preview Modal */}
      <KOTPrintPreview
        order={order}
        isOpen={showKOTModal}
        onClose={() => setShowKOTModal(false)}
      />

      {/* Cancellation & Refund Modal */}
      <OrderCancelRefundModal
        order={order}
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        onConfirmCancel={handleCancelAndRefund}
      />
    </div>
  );
}

export default OrderDetailPage;
