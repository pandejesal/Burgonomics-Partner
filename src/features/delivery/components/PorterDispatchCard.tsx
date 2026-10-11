import React, { useEffect } from 'react';
import {
  Bike,
  Phone,
  MapPin,
  Clock,
  ExternalLink,
  UserCheck,
  RotateCcw,
  Navigation,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Zap,
} from 'lucide-react';
import type { Order } from '@/types';
import {
  dispatchProviderLabel,
  type DispatchFareConfirm,
  type DispatchQuoteResult,
} from '@/services/partnerFunctionsApi';
import { isSafeTelNumber, isSafeTrackingUrl } from '@/utils/urlSafety';
import { playKDSChime } from '@/utils/kdsAudio';
import { ConfirmDialog } from '../../../admin/components/Utilities';

interface PorterDispatchCardProps {
  order: Order;
  /** Cheapest-serviceable-wins multi-provider quote (DR1). */
  quote?: DispatchQuoteResult;
  loadingQuote?: boolean;
  isDispatching?: boolean;
  isRebooking?: boolean;
  /** DR7 fare drift the server refused to book without staff sign-off. */
  fareConfirm?: DispatchFareConfirm | null;
  /** DR8 Porter manual lane — book in the Porter app, paste details back. */
  manualLane?: { instructions: string; pasteEndpoint?: string } | null;
  /** True while POST /dispatch/porter-manual is in flight. */
  isPasting?: boolean;
  onFetchQuote: (order: Order) => void;
  onDispatchPorter: (order: Order) => void;
  onOpenAssignModal: (order: Order) => void;
  onCancelPorter: (orderId: string) => void;
  onRebookPorter?: (order: Order) => void;
  /** DR7: book at the NEW fare the staff just confirmed. */
  onConfirmFare?: (order: Order) => void;
  onDismissFareConfirm?: (order: Order) => void;
  /** DR8: persist the Porter-app booking staff pasted in. */
  onPastePorter?: (order: Order, porterOrderId: string, trackingUrl?: string) => void;
}

export function getRiderStatusMeta(order: Order): {
  statusText: string;
  className: string;
  isPorter: boolean;
  isInHouse: boolean;
} {
  const deliveryStatus = (order as any).deliveryStatus || (order as any).delivery?.status;
  const status = (order.status || '').toLowerCase();
  const hasInHouseRider = (order as any).deliveryStatus === 'manually_assigned';

  // §4 No-Driver Rebook state: server flags needsRebook when a Porter driver
  // cancelled or no driver was found. Highest-priority pill so the alert card
  // reads urgent even if a stale riderName still lingers on the doc.
  const rebookNeeded =
    (order as any).needsRebook === true ||
    deliveryStatus === 'rider_cancelled' ||
    deliveryStatus === 'no_riders_available';

  if (rebookNeeded) {
    return {
      statusText: 'Rider Cancelled — Rebook Needed',
      className: 'bg-rose-950/80 text-rose-300 border-rose-500/50 animate-pulse',
      isPorter: false,
      isInHouse: false,
    };
  }

  if (hasInHouseRider) {
    return {
      statusText: 'In-House Staff Assigned',
      className: 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40',
      isPorter: false,
      isInHouse: true,
    };
  }

  if (deliveryStatus === 'driver_allocated' || order.riderName) {
    return {
      statusText: 'Porter Rider Allocated',
      className: 'bg-blue-950/80 text-blue-300 border-blue-500/40',
      isPorter: true,
      isInHouse: false,
    };
  }

  if (deliveryStatus === 'arrived_at_store') {
    return {
      statusText: 'Rider Arrived at Store',
      className: 'bg-indigo-950/80 text-indigo-300 border-indigo-500/40',
      isPorter: true,
      isInHouse: false,
    };
  }

  if (status === 'out_for_delivery') {
    return {
      statusText: 'Out for Delivery (In-Transit)',
      className: 'bg-cyan-950/80 text-cyan-300 border-cyan-500/40',
      isPorter: true,
      isInHouse: false,
    };
  }

  if (status === 'ready') {
    return {
      statusText: 'Packed — Awaiting Courier',
      className: 'bg-amber-950/80 text-amber-400 border-amber-500/40 animate-pulse',
      isPorter: false,
      isInHouse: false,
    };
  }

  return {
    statusText: 'Kitchen Cooking',
    className: 'bg-neutral-800 text-neutral-300 border-neutral-700',
    isPorter: false,
    isInHouse: false,
  };
}

export function PorterDispatchCard({
  order,
  quote,
  loadingQuote = false,
  isDispatching = false,
  isRebooking = false,
  fareConfirm = null,
  manualLane = null,
  isPasting = false,
  onFetchQuote,
  onDispatchPorter,
  onOpenAssignModal,
  onCancelPorter,
  onRebookPorter,
  onConfirmFare,
  onDismissFareConfirm,
  onPastePorter,
}: PorterDispatchCardProps) {
  // Loop 11: dispatch books a real paid courier — require explicit confirm
  // (every other money path already confirms). Fare shown before commit.
  const [confirmDispatch, setConfirmDispatch] = React.useState(false);
  // Loop: cancelling kills a live courier booking (rider may be en route) —
  // require explicit confirm, same as dispatch.
  const [confirmCancel, setConfirmCancel] = React.useState(false);
  // DR8 manual lane inputs (Porter order id pasted from the Porter app).
  const [pastePorterOrderId, setPastePorterOrderId] = React.useState('');
  const [pasteTrackingUrl, setPasteTrackingUrl] = React.useState('');
  useEffect(() => {
    onFetchQuote(order);
  }, [order.id]);

  const shortCode =
    (order as any).shortCode ||
    (order as any).orderNumber ||
    (typeof order.id === 'string' && order.id.length > 0
      ? order.id.slice(-6).toUpperCase()
      : 'ORDER');

  const riderMeta = getRiderStatusMeta(order);
  const isReady = order.status === 'ready';
  const isDispatched = order.status === 'out_for_delivery' || !!order.riderName;

  // §4 No-Driver Rebook state (mirrors the pill logic in getRiderStatusMeta).
  const deliveryStatus = (order as any).deliveryStatus || (order as any).delivery?.status;
  const needsRebook =
    (order as any).needsRebook === true ||
    deliveryStatus === 'rider_cancelled' ||
    deliveryStatus === 'no_riders_available';

  // §4 urgent audio notification — one-shot chime when the alert card appears,
  // guarded so re-renders of the same order never re-fire it.
  const chimeFiredRef = React.useRef(false);
  useEffect(() => {
    if (needsRebook && !chimeFiredRef.current) {
      chimeFiredRef.current = true;
      playKDSChime();
    }
  }, [needsRebook]);

  const addressText =
    order.deliveryAddress?.full ||
    [
      (order.deliveryAddress as any)?.line1,
      (order.deliveryAddress as any)?.line2,
      (order.deliveryAddress as any)?.landmark,
      (order.deliveryAddress as any)?.city,
      (order.deliveryAddress as any)?.pincode,
    ]
      .filter(Boolean)
      .join(', ') ||
    (order.deliveryAddress as any)?.street ||
    (order.deliveryAddress as any)?.address ||
    order.deliveryAddress?.label ||
    'Customer Address';

  // MT-23: explicit route origin — desktop/POS riders have no GPS fix, so
  // the directions URL needs the branch/store kitchen as `origin` to plot
  // the real pickup→drop route. Absent/malformed coords = no origin param
  // (Google falls back to asking the rider where they are).
  const rawOrder = order as any;
  const branchLat = rawOrder.branchCoordinates?.lat ?? rawOrder.store?.lat;
  const branchLng = rawOrder.branchCoordinates?.lng ?? rawOrder.store?.lng;
  const hasBranchOrigin =
    typeof branchLat === 'number' &&
    typeof branchLng === 'number' &&
    Number.isFinite(branchLat) &&
    Number.isFinite(branchLng);
  const mapsOriginParam = hasBranchOrigin ? `&origin=${branchLat},${branchLng}` : '';

  // No invented fallback fare: without a live quote the card says so and
  // the booking dialog states the fare is confirmed at booking. The old
  // '₹45' default showed a fake fare for a real paid booking.
  // Multi-provider (DR1): the quote's winner is the cheapest serviceable
  // provider; serviceable:false means the address is outside the 8km zone.
  const zoneOut = quote ? quote.serviceable === false : false;
  const winnerLabel = quote?.winner ? dispatchProviderLabel(quote.winner) : null;
  const fareEstimate =
    quote && quote.serviceable !== false && typeof quote.estimatedFare === 'number'
      ? `₹${quote.estimatedFare}`
      : null;
  const pickupTime =
    quote && typeof quote.estimatedPickupMinutes === 'number'
      ? `${quote.estimatedPickupMinutes}m pickup`
      : null;
  // Provider that owns the live booking (for cancel copy); legacy docs
  // without dispatchProvider but with a rider were Porter bookings.
  const activeProviderLabel = (order as any).dispatchProvider
    ? dispatchProviderLabel((order as any).dispatchProvider)
    : order.riderName
      ? 'Porter'
      : 'Courier';

  return (
    <div className="p-5 rounded-3xl bg-[#090909] border border-neutral-800 space-y-4 shadow-lg hover:border-neutral-700 transition-colors">
      {/* Card Header: Order #, Status Pill, and Total */}
      <div className="flex items-start justify-between gap-3 border-b border-neutral-850 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono font-black text-base sm:text-lg text-white">
              #{shortCode}
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${riderMeta.className}`}
            >
              {riderMeta.statusText}
            </span>
          </div>
          <p className="text-xs text-neutral-400 flex items-center gap-1.5 mt-0.5">
            <Clock className="w-3.5 h-3.5 text-neutral-500" />
            <span>Ready for dispatch</span>
            <span>•</span>
            <span className="font-mono font-bold text-white">₹{order.total || order.subtotal}</span>
          </p>
        </div>

        {/* Live multi-provider quote badge — winner = cheapest serviceable */}
        <div className="text-right">
          <span className="text-[10px] font-bold text-neutral-400 block uppercase">
            {winnerLabel ? `${winnerLabel} Cheapest Quote` : 'Courier Quote'}
          </span>
          <span className="font-mono font-black text-sm text-[#FF6600]">
            {loadingQuote
              ? 'Estimating...'
              : zoneOut
                ? 'Outside delivery zone'
                : (fareEstimate ?? 'Quote unavailable')}
          </span>
          <span className="text-[10px] text-neutral-500 block">
            {zoneOut ? 'Not serviced' : (pickupTime ?? '—')}
          </span>
        </div>
      </div>

      {/* Per-provider fan-out strip (DR2/DR3) — every quote verdict shown */}
      {quote && !zoneOut && quote.providers && quote.providers.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 -mt-1">
          <span className="text-[10px] font-bold text-neutral-500 uppercase mr-0.5">
            Providers:
          </span>
          {quote.providers.map((p) => {
            const isWinner = p.provider === quote.winner;
            return (
              <span
                key={p.provider}
                className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold border ${
                  isWinner
                    ? 'bg-emerald-950/70 border-emerald-600/60 text-emerald-300'
                    : 'bg-neutral-900 border-neutral-800 text-neutral-400'
                }`}
                title={p.error}
              >
                {dispatchProviderLabel(p.provider)}
                {p.outcome === 'ok' && typeof p.fare === 'number'
                  ? ` ₹${p.fare}`
                  : p.outcome === 'not_serviced'
                    ? ' n/a'
                    : ' retry'}
                {isWinner ? ' ✓' : ''}
              </span>
            );
          })}
        </div>
      )}

      {/* §4 No-Driver Alert Card: urgent — Porter rider cancelled or none found */}
      {needsRebook && (
        <div className="p-4 rounded-2xl bg-rose-950/30 border border-rose-700/60 space-y-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 animate-pulse" />
            <div className="min-w-0">
              <p className="text-sm font-black text-rose-300 uppercase tracking-wide">
                Porter Rider Cancelled
              </p>
              <p className="text-xs text-rose-200/80 mt-0.5 leading-relaxed">
                {order.riderCancellationReason ||
                  'No driver was available for this order. Rebook a new courier or switch to in-house delivery to keep it moving.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* 1-Click Rebook (delivery_porter.md §4) — re-requests a new Porter rider */}
            <button
              type="button"
              disabled={isRebooking}
              onClick={() => onRebookPorter?.(order)}
              className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-md transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50 min-h-[44px]"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isRebooking ? 'animate-spin' : ''}`} />
              <span>{isRebooking ? 'Booking New Rider...' : '1-Click Rebook'}</span>
            </button>

            {/* Fallback: Switch to In-House Delivery */}
            <button
              type="button"
              onClick={() => onOpenAssignModal(order)}
              className="py-2.5 px-3.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-emerald-700/60 text-emerald-300 hover:text-emerald-200 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Assign In-House Store Rider"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Switch to In-House Delivery</span>
            </button>
          </div>
        </div>
      )}

      {/* DR8 manual lane — Porter booked in the app, paste the ids back */}
      {manualLane && !isDispatched && !needsRebook && (
        <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-700/60 space-y-2.5">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-black text-amber-300 uppercase tracking-wide">
                Porter Manual Booking
              </p>
              <p className="text-xs text-amber-200/80 mt-0.5 leading-relaxed">
                {manualLane.instructions}
              </p>
            </div>
          </div>
          <input
            type="text"
            value={pastePorterOrderId}
            onChange={(e) => setPastePorterOrderId(e.target.value)}
            placeholder="Porter order id (e.g. POR-123456)"
            className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-amber-700/50 text-white placeholder-neutral-500 text-xs font-mono focus:outline-none focus:border-amber-500"
          />
          <input
            type="text"
            value={pasteTrackingUrl}
            onChange={(e) => setPasteTrackingUrl(e.target.value)}
            placeholder="Tracking link (https://porter.in/…, optional)"
            className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-amber-700/50 text-white placeholder-neutral-500 text-xs focus:outline-none focus:border-amber-500"
          />
          <button
            type="button"
            disabled={isPasting || !pastePorterOrderId.trim()}
            onClick={() => onPastePorter?.(order, pastePorterOrderId, pasteTrackingUrl)}
            className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-md transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50 min-h-[44px]"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{isPasting ? 'Saving...' : 'Save Porter Booking'}</span>
          </button>
        </div>
      )}

      {/* DR7 fare-change confirm — opens automatically when the server gated
          the booking; staff must approve the NEW fare before anything books. */}
      {fareConfirm && !isDispatched && !needsRebook && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => onDismissFareConfirm?.(order)}
          onConfirm={() => onConfirmFare?.(order)}
          title="Fare changed — confirm?"
          description={`${dispatchProviderLabel(fareConfirm.provider)}'s live fare moved from ₹${fareConfirm.quotedFare} to ₹${fareConfirm.newFare} (confirm threshold ₹${fareConfirm.threshold}). Confirm to book at the new fare — this action spends money.`}
          confirmLabel={`Book at ₹${fareConfirm.newFare}`}
        />
      )}

      {/* Customer & Address Details */}
      <div className="space-y-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="font-bold text-white text-xs truncate">{order.customerName}</span>
          {isSafeTelNumber(order.customerPhone || '') ? (
            <a
              href={`tel:${order.customerPhone}`}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 hover:underline"
            >
              <Phone className="w-3 h-3" />
              <span>{order.customerPhone}</span>
            </a>
          ) : (
            <span className="text-[11px] font-bold text-neutral-500">{order.customerPhone}</span>
          )}
        </div>

        <div className="flex items-start gap-2 text-neutral-400">
          <MapPin className="w-3.5 h-3.5 text-orange-400 shrink-0 mt-0.5" />
          <p className="truncate flex-1">{addressText}</p>
        </div>

        {order.deliveryAddress?.lat && order.deliveryAddress?.lng && (
          <a
            href={`https://www.google.com/maps/dir/?api=1${mapsOriginParam}&destination=${order.deliveryAddress.lat},${order.deliveryAddress.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-bold text-[#FF6600] hover:underline pt-0.5"
          >
            <span>Open Navigation Map</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      {/* Assigned Rider Info (if dispatched) */}
      {!needsRebook && (order.riderName || riderMeta.isInHouse) && (
        <div className="p-3 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-1.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-white flex items-center gap-1.5">
              <Bike className="w-4 h-4 text-cyan-400" />
              <span>{order.riderName || 'In-House Staff'}</span>
            </span>
            {order.riderVehicleNumber && (
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300 font-bold">
                {order.riderVehicleNumber}
              </span>
            )}
          </div>

          {order.riderPhone && (
            <div className="flex items-center justify-between pt-1">
              {isSafeTelNumber(order.riderPhone) ? (
                <a
                  href={`tel:${order.riderPhone}`}
                  className="text-emerald-400 font-bold text-[11px] flex items-center gap-1 hover:underline"
                >
                  <Phone className="w-3 h-3" />
                  <span>Call Courier ({order.riderPhone})</span>
                </a>
              ) : (
                <span className="text-[11px] font-bold text-neutral-500">{order.riderPhone}</span>
              )}

              {(order as any).delivery?.trackingUrl &&
                (isSafeTrackingUrl((order as any).delivery.trackingUrl) ? (
                  <a
                    href={(order as any).delivery.trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cyan-400 font-bold text-[11px] flex items-center gap-1 hover:underline"
                  >
                    <span>Live GPS Tracking</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : null)}
            </div>
          )}
        </div>
      )}

      {/* Action Triggers (hidden while the §4 rebook alert card is active) */}
      {!needsRebook && (
      <div className="flex items-center gap-2 pt-1">
        {!isDispatched ? (
          <>
            {/* Primary Action: book the cheapest serviceable provider
                (confirmed — real paid booking, DR1) */}
            <button
              type="button"
              disabled={isDispatching || zoneOut}
              onClick={() => setConfirmDispatch(true)}
              className="flex-1 py-2.5 rounded-xl bg-[#FF6600] hover:bg-[#e05a00] text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-md transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50 min-h-[44px]"
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>
                {isDispatching
                  ? 'Booking...'
                  : zoneOut
                    ? 'Outside Delivery Zone'
                    : `Call ${winnerLabel ?? 'Courier'}${fareEstimate ? ` (${fareEstimate})` : ''}`}
              </span>
            </button>
            {confirmDispatch && (
              <ConfirmDialog
                isOpen={true}
                onClose={() => setConfirmDispatch(false)}
                onConfirm={() => {
                  setConfirmDispatch(false);
                  onDispatchPorter(order);
                }}
                title={`Book ${winnerLabel ?? 'courier'}?`}
                description={fareEstimate
                  ? `This books a real paid courier via ${winnerLabel ?? 'the cheapest provider'} for order ${shortCode} at an estimated fare of ${fareEstimate} (cheapest serviceable provider). This action spends money.`
                  : `This books a real paid courier for order ${shortCode} via ${winnerLabel ?? 'the cheapest available provider'}. No live estimate is available — the final fare is confirmed at booking. This action spends money.`}
                confirmLabel="Book Courier"
              />
            )}

            {/* Fallback Action: In-House Staff Assignment */}
            <button
              type="button"
              onClick={() => onOpenAssignModal(order)}
              className="py-2.5 px-3.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Assign In-House Store Rider"
            >
              <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>In-House</span>
            </button>
          </>
        ) : (
          <>
          {/* Cancel / Re-dispatch button (confirmed — kills a live booking) */}
          <button
            type="button"
            onClick={() => setConfirmCancel(true)}
            className="w-full py-2 rounded-xl bg-rose-950/40 hover:bg-rose-950/80 border border-rose-800/60 text-rose-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[44px]"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Cancel {activeProviderLabel} / Re-assign</span>
          </button>
          {confirmCancel && (
            <ConfirmDialog
              isOpen={true}
              onClose={() => setConfirmCancel(false)}
              onConfirm={() => {
                setConfirmCancel(false);
                onCancelPorter(order.id);
              }}
              title={`Cancel ${activeProviderLabel} booking?`}
              description={`This cancels the live courier for order ${shortCode} and reverts it to the Ready queue. The rider may already be en route.`}
              confirmLabel="Cancel Booking"
              isDestructive={true}
            />
          )}
          </>
        )}
      </div>
      )}
    </div>
  );
}

export default PorterDispatchCard;
