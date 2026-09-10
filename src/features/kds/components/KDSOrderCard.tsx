import React from 'react';
import {
  Bike,
  ShoppingBag,
  UtensilsCrossed,
  CheckCircle2,
  ChefHat,
  Flame,
  Check,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { KOTTimerBadge } from './KOTTimerBadge';
import type { Order, OrderStatus } from '@/types';

/** Loop 10 (DPDP): wall-screen phones show last-5 only; tap-to-call keeps full number in href. */
function maskKitchenPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 5) return '•••••';
  return `••••• ${digits.slice(-5)}`;
}

interface KDSOrderCardProps {
  order: Order;
  checkedItems: Record<string, boolean>;
  onToggleItemCheck: (orderId: string, itemIdx: number) => void;
  onBumpOrder: (orderId: string, targetStatus: OrderStatus) => void;
  /** True while this order's bump mutation is in flight (button locks). */
  isBumping?: boolean;
  className?: string;
}

export function KDSOrderCard({
  order,
  checkedItems,
  onToggleItemCheck,
  onBumpOrder,
  isBumping = false,
  className = '',
}: KDSOrderCardProps) {
  const shortOrderNumber =
    (order as any).shortCode ||
    (order as any).orderNumber ||
    (order.id ? order.id.slice(0, 6).toUpperCase() : 'ORDER');

  const orderType = order.orderType || 'delivery';
  const isDelivery = orderType === 'delivery';
  const isTakeaway = orderType === 'takeaway';
  const isDineIn = orderType === 'dinein';

  // Check if all items on ticket are checked off
  const allItemsChecked =
    order.items && order.items.length > 0
      ? order.items.every((_, idx) => !!checkedItems[`${order.id}_${idx}`])
      : false;

  // Determine bump action based on current status
  const isPending = order.status === 'pending' || (order.status as any) === 'placed';
  const isPreparing = order.status === 'preparing' || order.status === 'accepted';
  const isReady = order.status === 'ready' || (order.status as any) === 'ready_for_pickup';

  const handleBump = () => {
    if (isPending) {
      onBumpOrder(order.id, 'preparing');
    } else if (isPreparing) {
      onBumpOrder(order.id, 'ready');
    } else if (isReady) {
      onBumpOrder(order.id, isDelivery ? 'out_for_delivery' : 'delivered');
    }
  };

  return (
    <div
      className={`flex flex-col justify-between rounded-2xl bg-[#0D0D0D] border-2 transition-all shadow-lg overflow-hidden select-none ${
        isPending
          ? 'border-emerald-500/50 shadow-emerald-950/20'
          : isPreparing
          ? 'border-[#FF6600]/60 shadow-orange-950/20'
          : 'border-blue-500/50 shadow-blue-950/20'
      } ${className}`}
    >
      {/* Top Header Strip */}
      <div className="p-3.5 bg-neutral-900/90 border-b border-neutral-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-base sm:text-lg font-black text-white tracking-wider truncate">
            #{shortOrderNumber}
          </span>

          {/* Fulfillment Badge */}
          {isDelivery && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-orange-500/20 border border-orange-500/40 text-orange-400 text-[10px] sm:text-xs font-black uppercase tracking-wider shrink-0">
              <Bike className="w-3 h-3" />
              <span>Delivery</span>
            </span>
          )}
          {isTakeaway && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[10px] sm:text-xs font-black uppercase tracking-wider shrink-0">
              <ShoppingBag className="w-3 h-3" />
              <span>Takeaway</span>
            </span>
          )}
          {isDineIn && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 text-[10px] sm:text-xs font-black uppercase tracking-wider shrink-0">
              <UtensilsCrossed className="w-3 h-3" />
              <span>Table {order.tableNumber || '01'}</span>
            </span>
          )}
        </div>

        {/* Live SLA Countdown Timer Badge */}
        <KOTTimerBadge createdAt={order.createdAt} />
      </div>

      {/* Customer / Ticket Sub-info */}
      <div className="px-3.5 py-2 bg-neutral-950/80 border-b border-neutral-800/80 flex items-center justify-between text-xs text-neutral-400">
        <div className="truncate">
          <span className="text-white font-bold">{order.customerName || 'Customer'}</span>
          {order.customerPhone && (
            <a
              href={`tel:${order.customerPhone.replace(/[^+\d]/g, '')}`}
              className="text-neutral-500 ml-1.5 font-mono text-[11px] underline decoration-dotted underline-offset-2"
              title="Tap to call customer"
            >
              ({maskKitchenPhone(order.customerPhone)})
            </a>
          )}
        </div>
        <span className="font-mono font-bold text-neutral-400">
          {order.items?.length || 0} {order.items?.length === 1 ? 'Item' : 'Items'}
        </span>
      </div>

      {/* Special Kitchen Cooking Instructions */}
      {order.specialInstructions && (
        <div className="mx-3 my-2 p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-start gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
          <span>Note: "{order.specialInstructions}"</span>
        </div>
      )}

      {/* Items Checklist for Chefs */}
      <div className="p-3.5 flex-1 space-y-2.5 overflow-y-auto max-h-[320px]">
        {order.items && order.items.length > 0 ? (
          order.items.map((item, idx) => {
            const isChecked = !!checkedItems[`${order.id}_${idx}`];
            const rawModifiers = (item as any).modifiers || (item as any).customizations || [];
            const modifiers = Array.isArray(rawModifiers) ? rawModifiers : [];

            return (
              <button
                key={idx}
                type="button"
                role="checkbox"
                aria-checked={isChecked}
                aria-label={`${item.quantity}x ${item.name}${isChecked ? ' (done)' : ''}`}
                onClick={() => onToggleItemCheck(order.id, idx)}
                className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-start gap-3 w-full text-left ${
                  isChecked
                    ? 'bg-neutral-900/40 border-neutral-800/60 opacity-50'
                    : 'bg-neutral-900/90 border-neutral-700/80 hover:border-neutral-600'
                }`}
              >
                {/* Touch Checkbox */}
                <span
                  aria-hidden
                  className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                    isChecked
                      ? 'bg-emerald-500 border-emerald-500 text-black'
                      : 'border-neutral-500 bg-neutral-800'
                  }`}
                >
                  {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                </span>

                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p
                      className={`text-sm font-bold text-white leading-tight ${
                        isChecked ? 'line-through text-neutral-400' : ''
                      }`}
                    >
                      <span className="font-mono text-[#FF6600] font-black mr-1.5 text-base">
                        {item.quantity}x
                      </span>
                      {item.name}
                    </p>
                  </div>

                  {/* Modifiers & Customizer Badges (Highlighted in #FF6600 / High Contrast) */}
                  {modifiers.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {modifiers.map((mod: string, mIdx: number) => (
                        <span
                          key={mIdx}
                          className="inline-block px-1.5 py-0.5 rounded bg-[#FF6600]/20 border border-[#FF6600]/40 text-[#FF6600] text-[10px] font-bold"
                        >
                          + {mod}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Item-level Special Instructions */}
                  {item.specialInstructions && (
                    <p className="text-[11px] text-amber-400 font-medium italic">
                      "{item.specialInstructions}"
                    </p>
                  )}
                </div>
              </button>
            );
          })
        ) : (
          <p className="text-xs text-neutral-500 italic py-2">No items listed on KOT ticket.</p>
        )}
      </div>

      {/* 1-Tap Bump Bar Action Button (Minimum 56px height for Palm/Finger Ergonomics) */}
      <div className="p-3 bg-neutral-950 border-t border-neutral-800/80">
        <button
          type="button"
          onClick={handleBump}
          disabled={isBumping}
          aria-busy={isBumping}
          className={`w-full h-14 min-h-[56px] rounded-xl font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.98] cursor-pointer ${
            isPending
              ? 'bg-[#0E4825] hover:bg-[#135d30] text-emerald-300 border border-emerald-500/50 shadow-emerald-950/50 animate-pulse'
              : isPreparing
              ? 'bg-[#FF6600] hover:bg-[#e05a00] text-white shadow-orange-950/50'
              : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-950/50'
          }`}
        >
          {isPending && (
            <>
              <ChefHat className="w-5 h-5 stroke-[2.5]" />
              <span>Accept KOT (Start Prep)</span>
            </>
          )}

          {isPreparing && (
            <>
              <Flame className="w-5 h-5 stroke-[2.5]" />
              <span>
                {allItemsChecked ? 'Mark Food Ready ✓' : 'Mark Food Ready / Packed'}
              </span>
            </>
          )}

          {isReady && (
            <>
              <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
              <span>{isDelivery ? 'Dispatch to Rider ✓' : 'Handover to Customer ✓'}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default KDSOrderCard;
